/** Pure evidence summarizer. It never sends requests or treats missing evidence as a pass. */
export function summarizeCapacity({ samples, planned, started, aborted = false, targets,
    maximumUnexpectedFailureFraction = 0.01, minimumStartedFraction = 0.99 }) {
    if (!Number.isInteger(planned) || !Number.isInteger(started) || planned < 1 || started < 0 || started > planned) {
        throw new Error('Invalid action accounting');
    }
    const groups = {};
    for (const sample of samples) {
        if (!targets[sample.operation] || !Number.isFinite(sample.durationMs) || sample.durationMs < 0
            || !['success', 'restricted', 'failure', 'integrity_failure'].includes(sample.outcome)
            || !['warmup', 'steady', 'burst', 'recovery', 'admission_probe'].includes(sample.phase)) {
            throw new Error('Invalid capacity sample');
        }
        if (sample.phase === 'warmup' || sample.phase === 'admission_probe') continue;
        (groups[sample.operation] ??= []).push(sample);
    }
    const operations = {};
    for (const [name, target] of Object.entries(targets)) {
        const rows = groups[name] ?? [];
        const successful = rows.filter(row => row.outcome === 'success').map(row => row.durationMs).sort((a, b) => a - b);
        const failures = rows.filter(row => row.outcome === 'failure' || row.outcome === 'integrity_failure').length;
        const integrityFailures = rows.filter(row => row.outcome === 'integrity_failure').length;
        const restricted = rows.filter(row => row.outcome === 'restricted').length;
        const enough = successful.length >= target.minimumSamples;
        const p95Ms = enough && target.p95Ms !== undefined ? successful[Math.ceil(successful.length * 0.95) - 1] : null;
        const maxMs = successful.length ? successful.at(-1) : null;
        operations[name] = {
            total: rows.length, successful: successful.length, failures, integrityFailures, restricted,
            p95Ms, maxMs,
            verdict: integrityFailures || (rows.length && failures / rows.length > maximumUnexpectedFailureFraction)
                || (p95Ms !== null && p95Ms > target.p95Ms) || (target.maxMs !== undefined && maxMs !== null && maxMs > target.maxMs)
                ? 'failed' : restricted ? 'admission_constrained' : !enough ? 'insufficient_evidence' : 'passed',
        };
    }
    const verdicts = Object.values(operations).map(operation => operation.verdict);
    return {
        planned, started, startedFraction: started / planned, aborted, operations,
        verdict: aborted || started / planned < minimumStartedFraction || verdicts.includes('failed') ? 'failed'
            : verdicts.includes('admission_constrained') ? 'admission_constrained'
                : verdicts.includes('insufficient_evidence') ? 'insufficient_evidence' : 'passed',
    };
}
