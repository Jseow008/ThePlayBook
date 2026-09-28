#!/usr/bin/env node
/** Explicitly authorized, bounded production observation; never a #28 acceptance run. */
import { readFile, stat, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { validateCommonConfig, makeTransport, makeActions, buildSchedule, runSchedule, IntegrityError, CORE_ACTION_CONTRACT } from './runner.mjs';

export const PRODUCTION_TOKEN = 'CONTROLLED_PRODUCTION_CAPACITY_28';
export const PRODUCTION_SCENARIO = {
    seed: 2801, pacingMs: 10000, maxElapsedMs: 720000, maxRequests: 2000, escalationPauseMs: 10000,
    phases: [
        { name: 'production_2', users: 2, durationMs: 60000 },
        { name: 'production_5', users: 5, durationMs: 60000 },
        { name: 'production_10', users: 10, durationMs: 120000 },
        { name: 'production_25', users: 25, durationMs: 180000 },
        { name: 'production_50', users: 50, durationMs: 60000 },
        { name: 'recovery', users: 5, durationMs: 60000 },
    ],
};
function requireCondition(condition, message) { if (!condition) throw new IntegrityError(message); }
export function validateProductionConfig(config, token) {
    requireCondition(token === PRODUCTION_TOKEN, 'Explicit production opt-in token required');
    const expectedUsers = config.preflightOnly === true ? 2 : 50;
    validateCommonConfig(config, expectedUsers);
    const authorization = config.productionAuthorization;
    requireCondition(config.origin === 'https://www.netflux.blog' && config.candidateProjectRef === 'xmuqsgfxuaaophxnwure', 'Exact production identities required');
    requireCondition(authorization?.token === token && authorization.origin === config.origin && authorization.projectRef === config.candidateProjectRef
        && /^dpl_[A-Za-z0-9]+$/.test(config.candidateDeploymentId) && authorization.deploymentId === config.candidateDeploymentId
        && /^[a-f0-9]{64}$/.test(authorization.evidenceSha256), 'Hash-bound fixed production deployment authorization required');
    requireCondition(/^capacity-[A-Za-z0-9_-]{1,71}$/.test(authorization.runId), 'Synthetic run ID required');
    requireCondition(authorization.currentCatalogOnly === true && authorization.quotaProtectionsUnchanged === true && authorization.syntheticOwnershipVerified === true,
        'Current catalog, unchanged quotas and verified synthetic ownership required');
    requireCondition(Array.isArray(authorization.fixtureAccountIds) && authorization.fixtureAccountIds.length === expectedUsers
        && new Set(authorization.fixtureAccountIds).size === expectedUsers && config.users.every(user => authorization.fixtureAccountIds.includes(user.accountId)), 'Exact run-owned fixture account authorization required');
    requireCondition(config.maxRequests <= PRODUCTION_SCENARIO.maxRequests, 'Production request bound is 2000');
    requireCondition(config.vercelProtectionBypass === undefined, 'Production bypass is prohibited');
    const rejectSetupCredentials = value => {
        if (!value || typeof value !== 'object') return;
        for (const [key, child] of Object.entries(value)) {
            requireCondition(!/service.?role|service.?key|admin.?key|access.?token|database.?url|postgres|password|secret/i.test(key), 'Setup credentials do not belong in traffic configuration');
            rejectSetupCredentials(child);
        }
    };
    rejectSetupCredentials(config);
    return config;
}
function routeGroup(request) {
    if (request.route === '/api/catalog/search') return 'catalog_search';
    if (request.route.startsWith('/read/')) return 'browse_reader';
    if (request.route === '/api/library/reflections') return request.method === 'POST' ? 'reflection_write' : 'reflection_read';
    if (request.route.startsWith('/api/account-data/user_library')) return request.method === 'POST' ? 'library_mutation' : 'library_read';
    return 'unknown';
}
/** Observed percentiles are safety gates even when samples cannot establish capacity. */
export function productionStageGate(result, requests, aborted = false) {
    const reasons = [], routes = {};
    const failures = requests.filter(row => row.outcome === 'failure').length;
    if (aborted) reasons.push('transport_aborted');
    if (result.samples.some(row => row.outcome === 'integrity_failure') || requests.some(row => row.outcome === 'integrity_failure')) reasons.push('integrity_failure');
    if (!requests.length || failures / requests.length > 0.01 || result.samples.some(row => row.outcome === 'failure') && failures === 0) reasons.push('unexpected_error_fraction');
    if (requests.some(row => row.status === 429) || result.samples.some(row => row.outcome === 'restricted')) reasons.push('unplanned_429');
    if (result.dropped.length || result.started !== result.planned) reasons.push('scheduling_drop_or_incomplete');
    for (const group of ['catalog_search', 'browse_reader', 'reflection_read', 'reflection_write', 'library_mutation', 'library_read']) {
        const rows = requests.filter(row => routeGroup(row) === group && row.outcome === 'success').map(row => row.durationMs).sort((a, b) => a - b);
        const minimumSamples = group === 'reflection_write' ? 30 : 100;
        const observedP95Ms = rows.length ? rows[Math.ceil(rows.length * 0.95) - 1] : null;
        const limitMs = group === 'browse_reader' ? 3000 : 2000;
        routes[group] = { samples: rows.length, minimumSamples, lowSampleSize: rows.length < minimumSamples, observedP95Ms, limitMs };
        if (observedP95Ms !== null && observedP95Ms > limitMs) reasons.push(`${group}_latency`);
    }
    return { healthy: reasons.length === 0, reasons, unexpectedErrorFraction: requests.length ? failures / requests.length : null, routes,
        capacityEstablished: false, interpretation: 'Safety escalation gate only; sparse or absent route samples cannot establish the #28 capacity envelope.' };
}

export async function runProduction(config, { fetchImpl = fetch, now = () => performance.now(), sleep = ms => new Promise(resolve => setTimeout(resolve, ms)), checkStage = async () => {} } = {}) {
    validateProductionConfig(config, config.productionAuthorization?.token);
    const startedAt = now(), transport = makeTransport(config, { fetchImpl, now }), action = makeActions(config, transport), stages = [];
    const hardStop = setTimeout(() => transport.abort('elapsed_bound'), PRODUCTION_SCENARIO.maxElapsedMs);
    const boundedSleep = async ms => {
        for (let remaining = ms; remaining > 0 && !transport.signal.aborted; remaining -= 1000) {
            await sleep(Math.min(1000, remaining));
            if (now() - startedAt >= PRODUCTION_SCENARIO.maxElapsedMs) transport.abort('elapsed_bound');
        }
    };
    let stopReason = null;
    try {
        await checkStage('preflight');
        const preflight = { phase: 'preflight', planned: 5, started: 0, samples: [], dropped: [], elapsedMs: 0 };
        const before = now();
        for (const [sequence, operation] of ['catalog_search', 'browse_reader', 'library_mutation', 'reflection_read', 'reflection_write'].entries()) {
            preflight.started++;
            try { await action({ operation, sequence, userIndex: 0 }); preflight.samples.push({ operation, outcome: 'success' }); }
            catch (error) {
                preflight.samples.push({ operation, outcome: error instanceof IntegrityError ? 'integrity_failure' : error.outcome ?? 'failure' });
                transport.abort(error instanceof IntegrityError ? 'preflight_integrity_failure' : 'preflight_request_failure');
                break;
            }
        }
        preflight.elapsedMs = now() - before;
        const preflightRequests = transport.requests.slice();
        preflight.gate = productionStageGate(preflight, preflightRequests, transport.signal.aborted);
        preflight.requests = preflightRequests; stages.push(preflight);
        if (!preflight.gate.healthy) stopReason = 'preflight_gate';
        for (const phase of config.preflightOnly === true ? [] : PRODUCTION_SCENARIO.phases) {
            if (stopReason || transport.signal.aborted) break;
            await boundedSleep(PRODUCTION_SCENARIO.escalationPauseMs);
            if (transport.signal.aborted) break;
            await checkStage(phase.name);
            const requestOffset = transport.requests.length;
            const result = await runSchedule(buildSchedule({ ...PRODUCTION_SCENARIO, phases: [phase] }), action,
                { now, sleep: boundedSleep, signal: transport.signal, onIntegrity: () => transport.abort('semantic_integrity_failure') });
            if (!transport.signal.aborted && result.elapsedMs < phase.durationMs) await boundedSleep(phase.durationMs - result.elapsedMs);
            const requests = transport.requests.slice(requestOffset);
            const gate = productionStageGate(result, requests, transport.signal.aborted);
            stages.push({ phase: phase.name, users: phase.users, durationMs: phase.durationMs, ...result, requests, gate });
            if (!gate.healthy) stopReason = `${phase.name}_gate`;
        }
    } catch (error) {
        stopReason = error instanceof IntegrityError ? 'integrity_failure' : 'runner_failure';
        transport.abort(stopReason);
    } finally { clearTimeout(hardStop); }
    stopReason ??= transport.signal.aborted ? transport.signal.reason.message : null;
    const completed = !stopReason && stages.length === (config.preflightOnly === true ? 1 : PRODUCTION_SCENARIO.phases.length + 1);
    const continuation = action.continuationConfig();
    continuation.requiresReconciliation = transport.signal.aborted || stages.some(stage => stage.samples.some(row => row.outcome !== 'success'));
    return { evidence: { version: 1, mode: 'controlled-production', generatedAt: new Date().toISOString(),
        deploymentId: config.candidateDeploymentId, authorizationEvidenceSha256: config.productionAuthorization.evidenceSha256,
        runId: config.productionAuthorization.runId, scenario: PRODUCTION_SCENARIO, coreActionContract: CORE_ACTION_CONTRACT,
        elapsedMs: now() - startedAt, completed, stopReason, abortReason: transport.signal.aborted ? transport.signal.reason.message : null,
        verdict: completed ? config.preflightOnly === true ? 'development-preflight-passed' : 'bounded-observation-completed' : 'stopped', closesIssue28: false,
        limitations: ['Shared production services and quotas; no dedicated backend or isolation claim.', 'Externally verified deployment and synthetic fixture ownership.', 'Observed p95 values with small samples are safety signals only.', 'Core HTTP actions only; separate bounded overlay evidence is required.'],
        stages, requests: transport.requests, maxRequestsInFlight: transport.maxInFlight }, continuation };
}
export async function main(args = process.argv.slice(2)) {
    const [configPath, outputPath, token] = args;
    requireCondition(configPath && outputPath && configPath !== outputPath, 'Usage: production-runner.mjs PRIVATE_CONFIG OUTPUT_JSON CONTROLLED_PRODUCTION_CAPACITY_28');
    requireCondition(((await stat(configPath)).mode & 0o077) === 0, 'Private config permissions must be 0600');
    requireCondition(!Object.keys(process.env).some(key => /SUPABASE.*(SERVICE|SECRET)|DATABASE_URL|POSTGRES.*URL|VERCEL_TOKEN/.test(key)), 'Remove setup credentials from the traffic process environment');
    const bytes = await readFile(configPath), config = validateProductionConfig(JSON.parse(bytes), token);
    const { evidence, continuation } = await runProduction(config);
    evidence.configurationSha256 = createHash('sha256').update(bytes).digest('hex');
    await writeFile(outputPath, `${JSON.stringify(evidence, null, 2)}\n`, { mode: 0o600, flag: 'wx' });
    await writeFile(`${configPath}.next.json`, `${JSON.stringify(continuation, null, 2)}\n`, { mode: 0o600, flag: 'wx' });
    console.log(JSON.stringify({ outputPath, continuationPath: `${configPath}.next.json`, verdict: evidence.verdict, requests: evidence.requests.length, stopReason: evidence.stopReason }));
    if (!evidence.completed) process.exitCode = 1;
    return evidence;
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main().catch(() => { console.error('Production runner refused configuration or could not write evidence.'); process.exitCode = 1; });
