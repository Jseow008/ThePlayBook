import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { buildSchedule, validateConfig, makeTransport, makeActions, runSchedule, IntegrityError } from './runner.mjs';
const id = n => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
function config() {
    return { origin: 'https://capacity-immutable-123.vercel.app', candidateDeploymentId: 'dpl_candidate',
        candidateProjectRef: 'abcdefghijklmnopqrst', productionHosts: ['production.vercel.app'],
        isolation: { verified: true, admissionEnabled: true, dedicatedRateBackend: true, syntheticOnly: true, evidenceSha256: 'a'.repeat(64) },
        maxRequests: 100, requestTimeoutMs: 100,
        catalogCases: [{ query: 'fixture', pages: [[id(1000)], [id(1001)]] }],
        users: Array.from({ length: 50 }, (_, n) => ({ accountId: id(n + 1), cookie: `fixture=${n}`, libraryRevision: 0, resetEpoch: 0,
            mutationContentId: id(2000 + n), readerContentId: id(1000), readerExpectedText: 'Fixture book',
            library: [{ content_id: id(1000), is_bookmarked: true, progress: null }],
            reflections: [{ id: id(3000 + n), content_item_id: id(1000), prompt: 'Prompt', reflection_text: `private fixture ${n}` }],
        })),
    };
}
const json = body => new Response(JSON.stringify(body), { headers: { 'content-type': 'application/json' } });
test('candidate guard rejects production, aliases, shared admission and duplicate sessions', () => {
    assert.equal(validateConfig(config()).users.length, 50);
    for (const mutate of [c => c.candidateProjectRef = 'xmuqsgfxuaaophxnwure', c => c.origin = 'https://production.vercel.app',
        c => c.origin = 'https://capacity.example.com', c => c.isolation.dedicatedRateBackend = false,
        c => c.users[1].cookie = c.users[0].cookie, c => c.maxRequests = 20001]) {
        const c = config(); mutate(c); assert.throws(() => validateConfig(c), IntegrityError);
    }
});
test('frozen scenario has deterministic staggered starts and both reflection directions', async () => {
    const scenario = JSON.parse(await readFile(new URL('./scenario.json', import.meta.url)));
    const first = buildSchedule(scenario);
    assert.deepEqual(first, buildSchedule(scenario));
    assert.equal(first.length, 2220);
    assert.equal(first.filter(row => row.phase === 'steady').length, 1500);
    assert.equal(first.filter(row => row.phase === 'burst').length, 600);
    assert.ok(first.some(row => row.operation === 'reflection_write'));
    assert.ok(first.some(row => row.operation === 'reflection_read'));
    for (const userIndex of [0, 24, 49]) {
        const rows = first.filter(row => row.userIndex === userIndex);
        assert.ok(rows.every((row, n) => n === 0 || row.atMs - rows[n - 1].atMs >= 10000));
    }
});
test('transport does not follow redirects or send forged ingress headers', async () => {
    const c = config(); let called = 0;
    const transport = makeTransport(c, { fetchImpl: async (url, options) => {
        called++; assert.equal(url.origin, c.origin); assert.equal(options.redirect, 'manual');
        assert.equal(options.headers['x-forwarded-for'], undefined);
        return new Response(null, { status: 307, headers: { location: 'https://production.vercel.app' } });
    } });
    await assert.rejects(transport.request(c.users[0], '/read/x'), IntegrityError);
    await assert.rejects(transport.request(c.users[0], '/read/x'));
    assert.equal(called, 1); assert.ok(transport.signal.aborted);
});
test('transport enforces hard request bound and retains 429 as restriction', async () => {
    const c = config(); c.maxRequests = 1;
    const transport = makeTransport(c, { fetchImpl: async () => new Response(null, { status: 429 }) });
    await assert.rejects(transport.request(c.users[0], '/api/catalog/search'), error => error.outcome === 'restricted');
    await assert.rejects(transport.request(c.users[0], '/api/catalog/search'));
    assert.equal(transport.requests.length, 1); assert.ok(transport.signal.aborted);
});
test('catalog checks both page cursor and exact expected result order', async () => {
    const c = config(); const urls = [];
    const action = makeActions(c, { request: async (_user, path) => {
        urls.push(path); const second = path.includes('cursor=');
        return { outcome: 'results', results: [{ id: id(second ? 1001 : 1000) }], pageInfo: { page: second ? 2 : 1, nextCursor: second ? null : 'opaque-cursor' } };
    } });
    await action({ operation: 'catalog_search', userIndex: 0, sequence: 0 });
    assert.equal(urls.length, 2); assert.ok(urls[1].includes('cursor=opaque-cursor'));
    const bad = makeActions(c, { request: async () => ({ outcome: 'results', results: [{ id: id(9999) }], pageInfo: { page: 1 } }) });
    await assert.rejects(bad({ operation: 'catalog_search', userIndex: 0, sequence: 0 }), IntegrityError);
});
test('library save/progress/remove requires exact acknowledgement and complete read-back', async () => {
    const c = config(); let revision = 0; let row; const payloads = [];
    const action = makeActions(c, { request: async (_user, path, options) => {
        if (path.endsWith('/mutation')) {
            const body = options.body; payloads.push(body); assert.equal(body.baseRevision, revision);
            row = body.deleteIfEmpty ? null : { content_id: body.contentId, is_bookmarked: body.isBookmarked, progress: body.progress };
            return { data: { libraryRevision: ++revision, resetEpoch: 0, outcome: 'applied' } };
        }
        return { data: [...c.users[0].library, ...(row ? [{ ...row, library_revision: String(revision) }] : [])], pageInfo: { hasNextPage: false } };
    } });
    for (let sequence = 0; sequence < 3; sequence++) await action({ operation: 'library_mutation', userIndex: 0, sequence });
    assert.equal(payloads[2].deleteIfEmpty, true);
    assert.equal(new Set(payloads.map(body => body.mutationId)).size, 3);
    const bad = makeActions(c, { request: async () => ({ data: { libraryRevision: 0, resetEpoch: 0 } }) });
    await assert.rejects(bad({ operation: 'library_mutation', userIndex: 0, sequence: 0 }), IntegrityError);
});
test('cross-account reflection data is an immediate integrity failure', async () => {
    const c = config(); const action = makeActions(c, { request: async () => ({ data: c.users[1].reflections }) });
    await assert.rejects(action({ operation: 'reflection_read', userIndex: 0, sequence: 0 }), IntegrityError);
});
test('scheduler drops busy starts without shifting offered work', async () => {
    let time = 0, release;
    const outstanding = new Promise(resolve => { release = resolve; });
    const events = [0, 10000, 20000].map(atMs => ({ atMs, userIndex: 0, phase: 'steady', operation: 'catalog_search' }));
    const result = await runSchedule(events, async () => outstanding, {
        now: () => time, sleep: async ms => { time += ms; if (time === 20000) release(); },
    });
    assert.equal(result.planned, 3); assert.ok(result.started < result.planned);
    assert.ok(result.dropped.length > 0); assert.equal(result.maxInFlight, 1);
});
test('scheduler aborts subsequent starts on semantic failure', async () => {
    const controller = new AbortController();
    const result = await runSchedule([0, 10000].map(atMs => ({ atMs, userIndex: 0, phase: 'steady', operation: 'reflection_read' })),
        async () => { throw new IntegrityError('private text must not be retained'); },
        { now: () => 0, sleep: async () => {}, signal: controller.signal, onIntegrity: () => controller.abort() });
    assert.equal(result.started, 1); assert.equal(result.samples[0].outcome, 'integrity_failure');
    assert.ok(!JSON.stringify(result).includes('private text'));
});
test('invalid JSON 200 is not useful success', async () => {
    const c = config(); const transport = makeTransport(c, { fetchImpl: async () => new Response('not json') });
    await assert.rejects(transport.request(c.users[0], '/api/catalog/search'), IntegrityError);
    assert.equal(transport.requests[0].outcome, 'integrity_failure');
});
test('transport records valid JSON response', async () => {
    const c = config(); const transport = makeTransport(c, { fetchImpl: async () => json({ data: [] }) });
    assert.deepEqual(await transport.request(c.users[0], '/api/library/reflections'), { data: [] });
});
test('every reflection action reads; alternate writes add separately timed sample and continuation state', async () => {
    const c = config(); let expected = structuredClone(c.users[0].reflections[0]); let requests = 0;
    const action = makeActions(c, { request: async (_user, _path, options) => {
        requests++;
        if (options?.method === 'POST') { expected = { ...expected, ...options.body }; return { data: { ...expected, user_id: c.users[0].accountId } }; }
        return { data: [expected] };
    } });
    const parts = await action({ operation: 'reflection_write', userIndex: 0, sequence: 5 });
    assert.deepEqual(parts.map(row => row.operation), ['reflection_read', 'reflection_write']);
    assert.equal(requests, 3);
    const continuation = action.continuationConfig();
    assert.equal(continuation.users[0].reflections[0].reflection_text, expected.reflection_text);
    assert.equal(validateConfig(continuation).users.length, 50);
});
test('measured reflection offered sample count meets frozen minimums before scheduling drops', async () => {
    const scenario = JSON.parse(await readFile(new URL('./scenario.json', import.meta.url)));
    const rows = buildSchedule(scenario).filter(row => row.phase !== 'warmup');
    const reads = rows.filter(row => row.operation.startsWith('reflection_')).length;
    const writes = rows.filter(row => row.operation === 'reflection_write').length;
    assert.ok(reads >= scenario.targets.reflection_read.minimumSamples);
    assert.ok(writes >= scenario.targets.reflection_write.minimumSamples);
});
test('scheduler preserves separately measured suboperations without inflating started actions', async () => {
    const result = await runSchedule([{ atMs: 0, userIndex: 0, phase: 'steady', operation: 'reflection_write' }], async () => [
        { operation: 'reflection_read', durationMs: 10 }, { operation: 'reflection_write', durationMs: 20 },
    ]);
    assert.equal(result.started, 1); assert.equal(result.samples.length, 2);
    assert.deepEqual(result.samples.map(row => row.durationMs), [10, 20]);
});
test('scoped preview bypass is validated, sent only in its dedicated header, and absent from evidence', async () => {
    const c = config(); c.vercelProtectionBypass = 'private-preview-token';
    validateConfig(c);
    const transport = makeTransport(c, { fetchImpl: async (_url, options) => {
        assert.equal(options.headers['x-vercel-protection-bypass'], c.vercelProtectionBypass);
        assert.equal(options.headers.authorization, undefined);
        return json({ data: [] });
    } });
    await transport.request(c.users[0], '/api/library/reflections');
    assert.ok(!JSON.stringify(transport.requests).includes(c.vercelProtectionBypass));
    for (const value of ['bad\nheader', 'bad\rheader', 42, '']) {
        c.vercelProtectionBypass = value; assert.throws(() => validateConfig(c), IntegrityError);
    }
});
test('library adopts actual trigger-produced revision and verifies it in read-back', async () => {
    const c = config(); let count = 0;
    const action = makeActions(c, { request: async (_user, _path, options) => {
        if (options?.method === 'POST') { count++; return { data: { libraryRevision: count * 2, resetEpoch: 0, outcome: 'applied' } }; }
        const state = action.continuationConfig().users[0];
        return { data: state.library.map(row => ({ ...row, library_revision: row.content_id === state.mutationContentId ? state.libraryRevision : 0 })), pageInfo: { hasNextPage: false } };
    } });
    await action({ operation: 'library_mutation', userIndex: 0, sequence: 0 });
    await action({ operation: 'library_mutation', userIndex: 0, sequence: 1 });
    assert.equal(action.continuationConfig().users[0].libraryRevision, 4);
});
test('library route latency excludes read-back while scheduling retains whole action time', async () => {
    const c = config(); let time = 0;
    const action = makeActions(c, { request: async (_user, _path, options) => {
        if (options?.method === 'POST') { time += 15; return { data: { libraryRevision: 1, resetEpoch: 0 } }; }
        time += 700;
        return { data: action.continuationConfig().users[0].library.map(row => ({ ...row, library_revision: 1 })), pageInfo: { hasNextPage: false } };
    } }, { now: () => time });
    const result = await runSchedule([{ atMs: 0, userIndex: 0, phase: 'steady', operation: 'library_mutation', sequence: 0 }], action, { now: () => time });
    assert.equal(result.samples[0].durationMs, 15);
    assert.equal(result.samples[0].actionDurationMs, 715);
    assert.equal(result.elapsedMs, 715);
});
test('catalog records each verified page latency rather than combined action latency', async () => {
    const c = config(); let time = 0, page = 0;
    const action = makeActions(c, { request: async () => {
        time += ++page * 10;
        return { outcome: 'results', results: [{ id: id(999 + page) }], pageInfo: { page, nextCursor: page === 1 ? 'next' : null } };
    } }, { now: () => time });
    const result = await runSchedule([{ atMs: 0, userIndex: 0, phase: 'steady', operation: 'catalog_search', sequence: 0 }], action, { now: () => time });
    assert.deepEqual(result.samples.map(row => row.durationMs), [10, 20]);
    assert.deepEqual(result.samples.map(row => row.actionDurationMs), [30, 30]);
    assert.equal(result.started, 1);
});

const productionModule = await import('./production-runner.mjs');
function productionConfig() {
    const c = config(); delete c.isolation;
    c.origin = 'https://www.netflux.blog'; c.candidateProjectRef = 'xmuqsgfxuaaophxnwure'; c.maxRequests = 2000;
    c.productionAuthorization = { token: productionModule.PRODUCTION_TOKEN, origin: c.origin, projectRef: c.candidateProjectRef,
        deploymentId: c.candidateDeploymentId, evidenceSha256: 'a'.repeat(64), runId: 'capacity-test-28',
        fixtureAccountIds: c.users.map(user => user.accountId), currentCatalogOnly: true, quotaProtectionsUnchanged: true, syntheticOwnershipVerified: true };
    return c;
}
test('production opt-in validates shared services honestly while default runner still denies production', () => {
    const c = productionConfig();
    assert.equal(productionModule.validateProductionConfig(c, productionModule.PRODUCTION_TOKEN), c);
    assert.throws(() => validateConfig(c), IntegrityError);
    for (const mutate of [c => c.origin = 'https://netflux.blog', c => c.productionAuthorization.deploymentId = 'dpl_changed',
        c => c.productionAuthorization.fixtureAccountIds[0] = id(9876), c => c.maxRequests = 2001,
        c => c.productionAuthorization.quotaProtectionsUnchanged = false, c => c.serviceRoleKey = 'private', c => c.vercelProtectionBypass = 'private']) {
        const c = productionConfig(); mutate(c);
        assert.throws(() => productionModule.validateProductionConfig(c, productionModule.PRODUCTION_TOKEN), IntegrityError);
    }
    assert.throws(() => productionModule.validateProductionConfig(c, undefined), IntegrityError);
});
test('production transport aborts at third consecutive 5xx completion before more traffic', async () => {
    const c = productionConfig(); let count = 0;
    const transport = makeTransport(c, { fetchImpl: async () => { count++; return new Response(null, { status: 503 }); } });
    for (let n = 0; n < 4; n++) await assert.rejects(transport.request(c.users[0], '/api/catalog/search'));
    assert.equal(count, 3); assert.equal(transport.signal.reason.message, 'consecutive_server_errors');
});
test('production escalation gates enforce errors, throttles, integrity, latency and drops despite small samples', () => {
    const result = { planned: 1, started: 1, samples: [{ outcome: 'success' }], dropped: [] };
    const request = { route: '/api/catalog/search', method: 'GET', status: 200, outcome: 'success', durationMs: 50 };
    const gate = productionModule.productionStageGate(result, [request]);
    assert.equal(gate.healthy, true); assert.equal(gate.capacityEstablished, false); assert.equal(gate.routes.catalog_search.lowSampleSize, true);
    for (const patch of [{ status: 429, outcome: 'restricted' }, { status: 500, outcome: 'failure' }, { outcome: 'integrity_failure' }, { durationMs: 2001 }]) {
        assert.equal(productionModule.productionStageGate(result, [{ ...request, ...patch }]).healthy, false);
    }
    assert.equal(productionModule.productionStageGate({ ...result, dropped: [{}] }, [request]).healthy, false);
});
test('production preflight failure records stop, private continuation and sends no later stage traffic', async () => {
    const c = productionConfig(); let count = 0;
    const { evidence, continuation } = await productionModule.runProduction(c, { fetchImpl: async () => { count++; return new Response(null, { status: 429 }); } });
    assert.equal(count, 1); assert.equal(evidence.completed, false); assert.equal(evidence.closesIssue28, false);
    assert.equal(evidence.stages.length, 1); assert.equal(evidence.stopReason, 'preflight_gate');
    assert.equal(continuation.requiresReconciliation, true);
    assert.ok(!JSON.stringify(evidence).includes(c.users[0].cookie));
});
test('bounded production completes exact phase ladder against a synthetic mock and never claims acceptance', async () => {
    const c = productionConfig(), state = new Map(c.users.map(user => [user.cookie, structuredClone(user)]));
    let time = 0;
    const { evidence, continuation } = await productionModule.runProduction(c, {
        now: () => time,
        sleep: async ms => { time += ms; await new Promise(resolve => setImmediate(resolve)); },
        fetchImpl: async (url, options) => {
            const user = state.get(options.headers.cookie);
            if (url.pathname === '/api/catalog/search') {
                const page = url.searchParams.has('cursor') ? 2 : 1;
                return json({ outcome: 'results', results: [{ id: id(999 + page) }], pageInfo: { page, nextCursor: page === 1 ? 'next' : null } });
            }
            if (url.pathname.startsWith('/read/')) return new Response('Fixture book');
            if (url.pathname === '/api/account-data/user_library/mutation') {
                const body = JSON.parse(options.body);
                user.library = user.library.filter(row => row.content_id !== body.contentId);
                user.libraryRevision++;
                if (!body.deleteIfEmpty) user.library.push({ content_id: body.contentId, is_bookmarked: body.isBookmarked, progress: body.progress, library_revision: user.libraryRevision });
                return json({ data: { libraryRevision: user.libraryRevision, resetEpoch: user.resetEpoch } });
            }
            if (url.pathname === '/api/account-data/user_library') return json({ data: user.library, pageInfo: { hasNextPage: false } });
            if (url.pathname === '/api/library/reflections') {
                if (options.method === 'POST') {
                    user.reflections[0] = { ...user.reflections[0], ...JSON.parse(options.body) };
                    return json({ data: { ...user.reflections[0], user_id: user.accountId } });
                }
                return json({ data: user.reflections });
            }
            throw new Error('Unexpected mock route');
        },
    });
    assert.equal(evidence.completed, true, JSON.stringify(evidence.stages.map(row => row.gate.reasons)));
    assert.deepEqual(evidence.stages.slice(1).map(row => row.users), [2, 5, 10, 25, 50, 5]);
    assert.ok(evidence.requests.length <= 2000); assert.ok(evidence.elapsedMs <= 720000);
    assert.equal(evidence.closesIssue28, false); assert.equal(continuation.requiresReconciliation, false);
    assert.equal(evidence.stages.every(row => row.gate.healthy), true);
});

test('production health/deployment gate can stop before any traffic', async () => {
    let requests = 0;
    const { evidence } = await productionModule.runProduction(productionConfig(), {
        checkStage: async () => { throw new Error('Health or deployment changed'); },
        fetchImpl: async () => { requests++; return json({}); },
    });
    assert.equal(requests, 0);
    assert.equal(evidence.completed, false);
    assert.equal(evidence.stopReason, 'runner_failure');
});

test('two-account production fixture requires explicit preflight-only mode', () => {
    const c = productionConfig();
    c.users = c.users.slice(0, 2);
    c.productionAuthorization.fixtureAccountIds = c.users.map(user => user.accountId);
    assert.throws(() => productionModule.validateProductionConfig(c, productionModule.PRODUCTION_TOKEN));
    c.preflightOnly = true;
    assert.equal(productionModule.validateProductionConfig(c, productionModule.PRODUCTION_TOKEN).users.length, 2);
});

test('concurrent action completion is independent of a pending shared request tail', async () => {
    for (const completionOrder of [[0, 1], [1, 0]]) {
        const cfg = config(); cfg.requestTimeoutMs = 5000;
        const resolvers = [];
        const transport = makeTransport(cfg, { fetchImpl: () => new Promise(resolve => resolvers.push(resolve)) });
        const action = makeActions(cfg, transport);
        const pending = [0, 1].map(userIndex => action({ operation: 'browse_reader', userIndex, sequence: 0 }));
        const [first, second] = completionOrder;
        resolvers[first](new Response('Fixture book'));
        await pending[first];
        assert.equal(transport.requests[first].outcome, 'success');
        assert.equal(transport.requests[second].outcome, 'failure'); // Still pending, not a verdict on the first action.
        resolvers[second](new Response('Fixture book'));
        await pending[second];
        assert(transport.requests.every(request => request.outcome === 'success'));
    }
});

test('genuine concurrent request failure stops scheduled work', async () => {
    const cfg = config(); cfg.requestTimeoutMs = 5000;
    const transport = makeTransport(cfg, { fetchImpl: async () => new Response('unavailable', { status: 503 }) });
    const action = makeActions(cfg, transport);
    const result = await runSchedule([
        { atMs: 0, userIndex: 0, operation: 'browse_reader', sequence: 0 },
        { atMs: 1, userIndex: 1, operation: 'browse_reader', sequence: 0 },
    ], async event => {
        try { return await action(event); }
        catch (error) { transport.abort('action_failure'); throw error; }
    }, { signal: transport.signal });
    assert(transport.signal.aborted);
    assert(result.samples.some(sample => sample.outcome === 'failure'));
    assert.equal(transport.requests[0].status, 503);
});

test('injected capacity transport leaves administrative global fetch unchanged', async () => {
    const original = globalThis.fetch;
    const cfg = config();
    const transport = makeTransport(cfg, { fetchImpl: async () => new Response('Fixture book') });
    await makeActions(cfg, transport)({ operation: 'browse_reader', userIndex: 0, sequence: 0 });
    assert.equal(globalThis.fetch, original);
});
