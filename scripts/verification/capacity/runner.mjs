#!/usr/bin/env node
/** Candidate-only HTTP core workload. No setup credentials or provider calls belong here. */
import { readFile, stat, writeFile } from 'node:fs/promises';
import { createHash, randomUUID } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';
import { pathToFileURL } from 'node:url';
import { summarizeCapacity } from './report.mjs';

const PRODUCTION_REF = 'xmuqsgfxuaaophxnwure';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MIX = [...Array(12).fill('catalog_search'), ...Array(4).fill('browse_reader'), ...Array(3).fill('library_mutation'), 'reflection'];
export const CORE_ACTION_CONTRACT = {
    catalog_search: '60%: exact ordered fixture pages, including configured category/type filters and cursor pages',
    browse_reader: '20%: reader HTTP document with expected fixture text',
    library_mutation: '15%: rotate save, progress update, remove; each acknowledged revision followed by complete library read-back',
    reflection: '5%: complete reflection read on every action; alternate actions additionally upsert one fixture and read back',
};
export class IntegrityError extends Error {}
function ensure(value, message) { if (!value) throw new IntegrityError(message); }

export function validateConfig(config) {
    ensure(config.requiresReconciliation !== true, 'Prior incomplete writes require fixture reconciliation');
    ensure(config.vercelProtectionBypass === undefined || (typeof config.vercelProtectionBypass === 'string' && config.vercelProtectionBypass.length > 0 && !/[\r\n]/.test(config.vercelProtectionBypass)), 'Invalid preview protection bypass');
    const origin = new URL(config.origin);
    ensure(origin.protocol === 'https:' && origin.origin === config.origin && !origin.username && !origin.password
        && /^[a-z0-9-]+\.vercel\.app$/.test(origin.hostname), 'Only a pinned HTTPS Vercel deployment origin is supported');
    ensure(config.candidateDeploymentId?.startsWith('dpl_') && config.candidateProjectRef !== PRODUCTION_REF
        && /^[a-z]{20}$/.test(config.candidateProjectRef), 'Candidate identities required');
    ensure(Array.isArray(config.productionHosts) && config.productionHosts.length > 0
        && !config.productionHosts.includes(origin.hostname), 'Production host denylist required');
    ensure(config.isolation?.verified === true && config.isolation?.admissionEnabled === true
        && config.isolation?.dedicatedRateBackend === true && config.isolation?.syntheticOnly === true
        && typeof config.isolation?.evidenceSha256 === 'string' && /^[a-f0-9]{64}$/.test(config.isolation.evidenceSha256),
    'Hash-bound external deployment, database and admission verification required');
    ensure(Number.isInteger(config.maxRequests) && config.maxRequests > 0 && config.maxRequests <= 20000, 'Request bound must be 1..20000');
    ensure(Number.isInteger(config.requestTimeoutMs) && config.requestTimeoutMs >= 100 && config.requestTimeoutMs <= 30000, 'Request deadline must be 100..30000ms');
    ensure(Array.isArray(config.catalogCases) && config.catalogCases.length > 0, 'Catalog expectations required');
    for (const fixture of config.catalogCases) {
        ensure(typeof fixture.query === 'string' && fixture.query.length > 0 && fixture.pages?.length > 0 && fixture.pages.length <= 5,
            'Bounded catalog pages required');
        ensure(fixture.pages.every(page => Array.isArray(page) && page.length > 0 && page.every(id => UUID.test(id))), 'Expected catalog IDs required');
    }
    ensure(config.users?.length === 50 && new Set(config.users.map(user => user.accountId)).size === 50 && new Set(config.users.map(user => user.cookie)).size === 50, 'Exactly 50 distinct fixture accounts required');
    for (const user of config.users) {
        ensure(UUID.test(user.accountId) && typeof user.cookie === 'string' && user.cookie.length > 0 && !/[\r\n]/.test(user.cookie), 'Ordinary user cookie required');
        ensure(Number.isSafeInteger(user.libraryRevision) && user.libraryRevision >= 0 && Number.isSafeInteger(user.resetEpoch) && user.resetEpoch >= 0, 'Library boundary required');
        ensure(UUID.test(user.mutationContentId) && UUID.test(user.readerContentId) && typeof user.readerExpectedText === 'string' && user.readerExpectedText.length > 0, 'Reader and mutation fixtures required');
        ensure(user.readerPath === undefined || (typeof user.readerPath === 'string' && user.readerPath.startsWith(`/read/${user.readerContentId}/`) && !/[?#]/.test(user.readerPath)), 'Invalid canonical reader path');
        ensure(Array.isArray(user.library) && user.library.length <= 1202 && user.library.every(row => UUID.test(row.content_id)), 'Complete expected library required');
        ensure((Number.isSafeInteger(user.mutations) && user.mutations >= 0) || !user.library.some(row => row.content_id === user.mutationContentId), 'Mutation fixture must initially be absent from library');
        ensure(user.reflections?.length > 0 && user.reflections.every(row => UUID.test(row.id) && UUID.test(row.content_item_id) && typeof row.reflection_text === 'string'), 'Complete expected reflections required');
    }
    return config;
}

/** Fixed starts never slide when an action runs slowly. One in-flight action per user. */
export function buildSchedule(scenario) {
    ensure(Number.isInteger(scenario.pacingMs) && scenario.pacingMs >= 10000 && Number.isInteger(scenario.seed), 'Invalid pacing/seed');
    const schedule = [];
    let offset = 0;
    for (const phase of scenario.phases) {
        ensure(Number.isInteger(phase.users) && phase.users >= 1 && phase.users <= 50 && phase.durationMs > 0, 'Invalid phase');
        for (let tick = 0; tick * scenario.pacingMs < phase.durationMs; tick++) {
            for (let userIndex = 0; userIndex < phase.users; userIndex++) {
                const atMs = offset + tick * scenario.pacingMs + Math.floor(userIndex * scenario.pacingMs / 50);
                if (atMs >= offset + phase.durationMs) continue;
                // Co-prime stride spreads expensive operations across each pacing interval.
                let operation = MIX[(tick + userIndex * 7 + scenario.seed) % MIX.length];
                if (operation === 'reflection') operation = Math.floor((tick + userIndex * 7 + scenario.seed) / MIX.length) % 2 ? 'reflection_write' : 'reflection_read';
                schedule.push({ atMs, phase: phase.name, userIndex, operation, sequence: tick });
            }
        }
        offset += phase.durationMs;
    }
    return schedule.sort((a, b) => a.atMs - b.atMs || a.userIndex - b.userIndex);
}

export function makeTransport(config, { fetchImpl = fetch, now = () => performance.now() } = {}) {
    const controller = new AbortController();
    const requests = [];
    let inFlight = 0, maxInFlight = 0;
    function abort(reason) { if (!controller.signal.aborted) controller.abort(new Error(reason)); }
    async function request(user, path, { method = 'GET', body, html = false } = {}) {
        ensure(path.startsWith('/') && !path.startsWith('//') && new URL(path, config.origin).origin === config.origin, 'Cross-origin request refused');
        if (controller.signal.aborted) throw controller.signal.reason;
        if (requests.length >= config.maxRequests) { abort('request_bound'); throw controller.signal.reason; }
        const record = { route: path.split('?')[0].replace(/[a-f0-9-]{36}/g, ':id'), method, status: 0, durationMs: 0, outcome: 'failure' };
        requests.push(record);
        const start = now();
        inFlight++; maxInFlight = Math.max(maxInFlight, inFlight);
        try {
            const response = await fetchImpl(new URL(path, config.origin), {
                method, redirect: 'manual', signal: AbortSignal.any([controller.signal, AbortSignal.timeout(config.requestTimeoutMs)]),
                headers: { cookie: user.cookie, ...(config.vercelProtectionBypass ? { 'x-vercel-protection-bypass': config.vercelProtectionBypass } : {}), accept: html ? 'text/html' : 'application/json', ...(body ? { 'content-type': 'application/json' } : {}) },
                ...(body ? { body: JSON.stringify(body) } : {}),
            });
            record.status = response.status;
            ensure(response.status < 300 || response.status >= 400, 'Redirect/target identity change');
            ensure(!response.url || new URL(response.url).origin === config.origin, 'Response target identity change');
            if (!response.ok) {
                record.outcome = response.status === 429 ? 'restricted' : 'failure';
                const error = new Error(`HTTP ${response.status}`); error.outcome = record.outcome; error.status = response.status; throw error;
            }
            // Bound response consumption as well as connection establishment.
            let bytes = 0; const chunks = [];
            for await (const chunk of response.body) {
                bytes += chunk.length; ensure(bytes <= 8 * 1024 * 1024, 'Response size bound'); chunks.push(chunk);
            }
            const text = Buffer.concat(chunks).toString('utf8');
            let result;
            try { result = html ? text : JSON.parse(text); } catch { throw new IntegrityError('Invalid JSON success response'); }
            record.outcome = 'success';
            return result;
        } catch (error) {
            if (error instanceof IntegrityError) { record.outcome = 'integrity_failure'; abort(error.message); }
            record.timeout = error.name === 'TimeoutError';
            throw error;
        } finally {
            record.durationMs = now() - start; inFlight--;
            const window = requests.filter(row => row.durationMs > 0).slice(-100);
            if (window.length === 100 && window.filter(row => row.status === 0 || row.status >= 500).length > 5) abort('failure_window');
        }
    }
    return { request, abort, signal: controller.signal, requests, get maxInFlight() { return maxInFlight; } };
}

function libraryValue(row) { return { content_id: row.content_id, is_bookmarked: row.is_bookmarked, progress: row.progress ?? null }; }
export function makeActions(config, transport, { now = () => performance.now() } = {}) {
    const states = config.users.map(user => ({ ...structuredClone(user), library: new Map(user.library.map(row => [row.content_id, libraryValue(row)])), mutations: user.mutations ?? 0 }));
    async function readLibrary(user) {
        const rows = []; const cursors = new Set(); let cursor;
        for (let page = 0; page < 8; page++) {
            const result = await transport.request(user, `/api/account-data/user_library?limit=200${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`);
            ensure(Array.isArray(result.data) && typeof result.pageInfo?.hasNextPage === 'boolean', 'Malformed library page');
            rows.push(...result.data);
            if (!result.pageInfo.hasNextPage) {
                ensure(rows.length === user.library.size && new Set(rows.map(row => row.content_id)).size === rows.length, 'Library count/duplicate mismatch');
                for (const row of rows) {
                    ensure(isDeepStrictEqual(libraryValue(row), user.library.get(row.content_id)), 'Library isolation or mutation data mismatch');
                    if (row.content_id === user.mutationContentId) ensure(row.library_revision === user.libraryRevision, 'Library read-back revision differs from acknowledgement');
                }
                return;
            }
            cursor = result.pageInfo.endCursor;
            ensure(typeof cursor === 'string' && cursor && !cursors.has(cursor), 'Invalid library cursor'); cursors.add(cursor);
        }
        throw new IntegrityError('Library page bound');
    }
    async function reflections(user) {
        const result = await transport.request(user, '/api/library/reflections');
        ensure(Array.isArray(result.data) && result.data.length === user.reflections.length && new Set(result.data.map(row => row.id)).size === result.data.length, 'Reflection count mismatch');
        for (const row of result.data) {
            const expected = user.reflections.find(item => item.id === row.id);
            ensure(expected && row.content_item_id === expected.content_item_id && row.reflection_text === expected.reflection_text && row.prompt === expected.prompt, 'Reflection isolation/data mismatch');
        }
    }
    const action = async function ({ operation, userIndex, sequence }) {
        const user = states[userIndex];
        if (operation === 'catalog_search') {
            const fixture = config.catalogCases[(sequence + userIndex) % config.catalogCases.length];
            const params = new URLSearchParams({ q: fixture.query, ...(fixture.category ? { category: fixture.category } : {}), ...(fixture.type ? { type: fixture.type } : {}) });
            const seen = new Set(), measurements = [];
            for (let page = 0; page < fixture.pages.length; page++) {
                const requestStarted = now();
                const result = await transport.request(user, `/api/catalog/search?${params}`);
                measurements.push({ operation: 'catalog_search', durationMs: now() - requestStarted, page: page + 1 });
                ensure(result.outcome === 'results' && Array.isArray(result.results) && result.pageInfo?.page === page + 1, 'Catalog response mismatch');
                ensure(isDeepStrictEqual(result.results.map(row => row.id), fixture.pages[page]), 'Catalog fixture/order mismatch');
                for (const row of result.results) { ensure(!seen.has(row.id), 'Repeated catalog result'); seen.add(row.id); }
                if (page < fixture.pages.length - 1) { ensure(typeof result.pageInfo.nextCursor === 'string' && result.pageInfo.nextCursor, 'Missing catalog cursor'); params.set('cursor', result.pageInfo.nextCursor); }
                else ensure(result.pageInfo.nextCursor === null, 'Unexpected additional catalog page');
            }
            return measurements;
        } else if (operation === 'browse_reader') {
            const html = await transport.request(user, user.readerPath ?? `/read/${user.readerContentId}`, { html: true });
            ensure(html.includes(user.readerExpectedText), 'Reader fixture absent from HTTP document');
        } else if (operation === 'library_mutation') {
            const variant = user.mutations % 3;
            const payload = { mutationId: randomUUID(), createdAt: new Date().toISOString(), expectedAccountId: user.accountId,
                baseRevision: user.libraryRevision, resetEpoch: user.resetEpoch, contentId: user.mutationContentId,
                isBookmarked: variant !== 2, progress: variant === 1 ? { itemId: user.mutationContentId, completed: [], lastSegmentIndex: 0, lastReadAt: new Date().toISOString(), isCompleted: false } : null,
                lastInteractedAt: new Date().toISOString(), deleteIfEmpty: variant === 2 };
            const requestStarted = now();
            const { data } = await transport.request(user, '/api/account-data/user_library/mutation', { method: 'POST', body: payload });
            const acknowledgementDurationMs = now() - requestStarted;
            ensure(Number.isSafeInteger(data?.libraryRevision) && data.libraryRevision > user.libraryRevision && data.resetEpoch === user.resetEpoch && (!data.outcome || data.outcome === 'applied'), 'Incorrect library acknowledgement');
            user.libraryRevision = data.libraryRevision; user.mutations++;
            if (variant === 2) user.library.delete(user.mutationContentId);
            else user.library.set(user.mutationContentId, { content_id: user.mutationContentId, is_bookmarked: payload.isBookmarked, progress: payload.progress });
            await readLibrary(user);
            return [{ operation: 'library_mutation', durationMs: acknowledgementDurationMs }];
        } else if (operation === 'reflection_read') await reflections(user);
        else if (operation === 'reflection_write') {
            const readStarted = now();
            await reflections(user);
            const readDuration = now() - readStarted;
            const writeStarted = now();
            const expected = user.reflections[0];
            const body = { content_item_id: expected.content_item_id, prompt: expected.prompt, reflection_text: `${expected.reflection_text.split(' [capacity:')[0]} [capacity:${sequence}]` };
            const { data } = await transport.request(user, '/api/library/reflections', { method: 'POST', body });
            const writeDuration = now() - writeStarted;
            ensure(data?.user_id === user.accountId && data.id === expected.id && data.content_item_id === expected.content_item_id && data.prompt === body.prompt && data.reflection_text === body.reflection_text, 'Incorrect reflection acknowledgement');
            expected.reflection_text = body.reflection_text;
            await reflections(user);
            return [{ operation: 'reflection_read', durationMs: readDuration }, { operation: 'reflection_write', durationMs: writeDuration }];
        } else throw new Error('Unsupported operation');
    };
    action.continuationConfig = () => ({ ...config, users: states.map(user => ({ ...user, library: [...user.library.values()] })) });
    return action;
}

export async function runSchedule(schedule, action, { now = () => performance.now(), sleep = ms => new Promise(resolve => setTimeout(resolve, ms)), signal, onIntegrity = () => {} } = {}) {
    const start = now(), busy = new Set(), pending = new Set(), samples = [], dropped = [];
    let started = 0, maxInFlight = 0;
    for (const event of schedule) {
        if (signal?.aborted) break;
        const delay = event.atMs - (now() - start);
        if (delay > 0) await sleep(delay);
        if (signal?.aborted) break;
        const lagMs = Math.max(0, now() - start - event.atMs);
        if (busy.has(event.userIndex) || lagMs >= 10000) { dropped.push({ phase: event.phase, operation: event.operation, atMs: event.atMs, lagMs }); continue; }
        busy.add(event.userIndex); started++; maxInFlight = Math.max(maxInFlight, busy.size);
        const before = now();
        const work = (async () => {
            const sample = { operation: event.operation, phase: event.phase, atMs: event.atMs, lagMs, outcome: 'success', durationMs: 0 };
            let parts;
            try { parts = await action(event); }
            catch (error) {
                sample.outcome = error instanceof IntegrityError ? 'integrity_failure' : error.outcome ?? 'failure';
                if (error instanceof IntegrityError) onIntegrity('semantic_integrity_failure');
                // Never persist server bodies, account IDs, fixture text, cookies or raw exceptions.
            } finally { sample.durationMs = now() - before; sample.actionDurationMs = sample.durationMs;
                if (parts?.length && sample.outcome === 'success') samples.push(...parts.map(part => ({ ...sample, ...part })));
                else samples.push(sample);
                busy.delete(event.userIndex); }
        })();
        pending.add(work); void work.finally(() => pending.delete(work));
    }
    await Promise.all(pending);
    return { planned: schedule.length, started, samples, dropped, maxInFlight, elapsedMs: now() - start };
}

export async function main(args = process.argv.slice(2)) {
    const [configPath, outputPath, mode = 'sample'] = args;
    if (!configPath || !outputPath || !['sample', 'full'].includes(mode)) throw new Error('Usage: node runner.mjs PRIVATE_CONFIG OUTPUT_JSON [sample|full]');
    ensure(configPath !== outputPath, 'Evidence must not overwrite private configuration');
    ensure(((await stat(configPath)).mode & 0o077) === 0, 'Private config permissions must be 0600');
    const configBytes = await readFile(configPath);
    const config = validateConfig(JSON.parse(configBytes));
    if (mode === 'full') ensure(config.developmentSample?.passed === true && /^[a-f0-9]{64}$/.test(config.developmentSample?.evidenceSha256), 'Successful development sample evidence required');
    const scenario = JSON.parse(await readFile(new URL('./scenario.json', import.meta.url), 'utf8'));
    const transport = makeTransport(config), action = makeActions(config, transport);
    const hardStop = setTimeout(() => transport.abort('elapsed_bound'), mode === 'full' ? scenario.maxElapsedMs : 120000);
    let result;
    try {
        // Semantic preflight precedes both the explicit development sample and full load.
        for (const [sequence, operation] of ['catalog_search', 'browse_reader', 'library_mutation', 'reflection_read', 'reflection_write'].entries()) {
            await action({ operation, sequence, userIndex: 0 });
        }
        const workload = mode === 'sample' ? { ...scenario, phases: [{ name: 'warmup', users: 2, durationMs: 30000 }] } : scenario;
        result = await runSchedule(buildSchedule(workload), action, { signal: transport.signal, onIntegrity: reason => transport.abort(reason) });
        const duration = workload.phases.reduce((sum, phase) => sum + phase.durationMs, 0);
        // Retain the full trailing pacing interval as part of the phase duration.
        if (!transport.signal.aborted && result.elapsedMs < duration) await new Promise(resolve => setTimeout(resolve, duration - result.elapsedMs));
        result.elapsedMs = Math.max(result.elapsedMs, duration);
    } catch (error) {
        transport.abort(error instanceof IntegrityError ? error.message : Number.isInteger(error.status) ? `preflight_http_${error.status}` : error.name === 'TimeoutError' ? 'preflight_request_timeout' : 'preflight_request_failure');
        result = { planned: buildSchedule(scenario).length, started: 0, samples: [], dropped: [], elapsedMs: 0, maxInFlight: 0 };
    } finally { clearTimeout(hardStop); }
    const summary = summarizeCapacity({ ...result, aborted: transport.signal.aborted, targets: scenario.targets });
    const phaseOperations = {};
    for (const sample of result.samples) {
        const key = `${sample.phase}:${sample.operation}`;
        (phaseOperations[key] ??= []).push(sample);
    }
    for (const [key, rows] of Object.entries(phaseOperations)) {
        const durations = rows.filter(row => row.outcome === 'success').map(row => row.durationMs).sort((a, b) => a - b);
        const minimum = scenario.targets[rows[0].operation].minimumSamples;
        phaseOperations[key] = { total: rows.length, successful: durations.length,
            p50Ms: durations.length ? durations[Math.ceil(durations.length * 0.5) - 1] : null,
            p95Ms: durations.length >= minimum ? durations[Math.ceil(durations.length * 0.95) - 1] : null,
            maxMs: durations.at(-1) ?? null,
            outcomes: Object.fromEntries(['success', 'restricted', 'failure', 'integrity_failure'].map(outcome => [outcome, rows.filter(row => row.outcome === outcome).length])),
        };
    }
    const evidence = { version: 1, mode, coreActionContract: CORE_ACTION_CONTRACT, latencyBasis: 'durationMs measures individual catalog page / mutation acknowledgement HTTP response; actionDurationMs includes all validation reads and governs scheduling', phaseOperations, generatedAt: new Date().toISOString(), scenario,
        configurationSha256: createHash('sha256').update(configBytes).digest('hex'),
        isolationEvidenceSha256: config.isolation.evidenceSha256,
        limitations: ['Single real generator ingress; no spoofed forwarding headers.', 'Reader HTTP document only; no browser rendering or recommendation API.', 'Export and real AI overlays are not implemented; this runner cannot establish full-envelope pass.', 'Deployment/database/admission identity relies on externally verified hash-bound isolation evidence.'],
        ...result, requests: transport.requests, maxRequestsInFlight: transport.maxInFlight, summary,
        samplePassed: mode === 'sample' && !transport.signal.aborted && result.started === result.planned && result.samples.every(row => row.outcome === 'success'),
        abortReason: transport.signal.aborted ? transport.signal.reason.message : null };
    await writeFile(outputPath, `${JSON.stringify(evidence, null, 2)}\n`, { mode: 0o600, flag: 'wx' });
    const continuation = action.continuationConfig();
    continuation.requiresReconciliation = transport.signal.aborted || result.samples.some(row => row.outcome !== 'success');
    if (evidence.samplePassed) continuation.developmentSample = { passed: true, evidenceSha256: createHash('sha256').update(await readFile(outputPath)).digest('hex') };
    await writeFile(`${configPath}.next.json`, `${JSON.stringify(continuation, null, 2)}\n`, { mode: 0o600, flag: 'wx' });
    console.log(JSON.stringify({ outputPath, continuationPath: `${configPath}.next.json`, verdict: summary.verdict, samplePassed: evidence.samplePassed, requests: transport.requests.length }));
    if (transport.signal.aborted || (mode === 'sample' ? !evidence.samplePassed : summary.verdict !== 'passed')) process.exitCode = 1;
    return evidence;
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main().catch(() => { console.error('Capacity runner refused configuration or could not write evidence.'); process.exitCode = 1; });
