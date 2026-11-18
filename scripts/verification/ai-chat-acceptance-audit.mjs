/** Local test-only preload. Does not alter provider requests or application settings. */
import { appendFileSync, readFileSync, mkdirSync, rmdirSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
export const OPENAI_MAX_CONTEXT = 1_050_000;
export function maximumProviderCost(provider, body) {
    if (provider === 'openai') {
        if (body.model !== 'gpt-6-luna' || (body.reasoning?.effort ?? body.reasoning_effort) !== 'none') throw new Error('Acceptance run permits Luna with reasoning none only');
        const output = body.max_output_tokens ?? body.max_completion_tokens;
        if (!Number.isSafeInteger(output) || output < 1 || output > 1600) throw new Error('Unbounded output rejected');
        return (OPENAI_MAX_CONTEXT * .20 + output * .75) / 1e6;
    }
    const count = body.requests?.length ?? (Array.isArray(body.contents) ? body.contents.length : 1);
    if (!Number.isSafeInteger(count) || count < 1 || count > 1000) throw new Error('Unbounded embeddings rejected');
    return count * 2048 * .15 / 1e6;
}
export function measuredProviderCost(provider, body) {
    const usage = body?.response?.usage ?? body?.usage;
    if (provider !== 'openai') return null; // Retain complete-context embedding reservation.
    if (!Number.isSafeInteger(usage?.input_tokens) || usage.input_tokens < 0
        || !Number.isSafeInteger(usage?.output_tokens) || usage.output_tokens < 0) return null;
    const cached = usage.input_tokens_details?.cached_tokens ?? 0;
    if (!Number.isSafeInteger(cached) || cached < 0 || cached > usage.input_tokens) return null;
    const long = usage.input_tokens > 272_000;
    return { inputTokens: usage.input_tokens, cachedInputTokens: cached, outputTokens: usage.output_tokens,
        costUsd: ((usage.input_tokens - cached) * (long ? .20 : .10) + cached * (long ? .02 : .01) + usage.output_tokens * (long ? .75 : .50)) / 1e6 };
}
export function auditTotal(rows, prior) {
    const settled = new Map(rows.filter(x => x.type === 'settle').map(x => [x.id, x.costUsd]));
    return prior + rows.filter(x => x.type === 'reserve').reduce((sum, x) => sum + (settled.get(x.id) ?? x.maxUsd), 0);
}
const path = process.env.AI_ACCEPTANCE_AUDIT;
if (path && !globalThis[Symbol.for('netflux.acceptance.audit')]) {
    globalThis[Symbol.for('netflux.acceptance.audit')] = true;
    const original = globalThis.fetch;
    const prior = Number(process.env.AI_ACCEPTANCE_PRIOR_USD);
    if (!Number.isFinite(prior) || prior < 0 || prior >= 5) throw new Error('Verified prior spend required');
    const rows = () => { try { return readFileSync(path, 'utf8').split('\n').filter(Boolean).map(x => JSON.parse(x)); } catch (e) { if (e.code === 'ENOENT') return []; throw e; } };
    function append(row) { appendFileSync(path, JSON.stringify({ at: new Date().toISOString(), ...row }) + '\n', { mode: 0o600 }); }
    async function locked(run) {
        for (let n = 0; n < 100; n++) {
            try { mkdirSync(path + '.lock'); } catch (e) { if (e.code !== 'EEXIST') throw e; await new Promise(r => setTimeout(r, 20)); continue; }
            try { return run(); } finally { rmdirSync(path + '.lock'); }
        }
        throw new Error('Acceptance accounting lock unavailable');
    }
    globalThis.fetch = async function(input, init) {
        const url = new URL(typeof input === 'string' || input instanceof URL ? String(input) : input.url);
        const provider = url.hostname === 'api.openai.com' ? 'openai' : url.hostname === 'generativelanguage.googleapis.com' && /(?:batchEmbedContents|embedContent)$/.test(url.pathname) ? 'google' : null;
        if (!provider) return original(input, init);
        const body = JSON.parse(typeof init?.body === 'string' ? init.body : await input.clone().text());
        const maxUsd = maximumProviderCost(provider, body), id = randomUUID(), started = performance.now();
        await locked(() => { if (auditTotal(rows(), prior) + maxUsd > 5) throw new Error('US$5 cumulative acceptance budget exhausted'); append({ type: 'reserve', id, provider, model: body.model ?? 'gemini-embedding-001', reasoningEffort: provider === 'openai' ? body.reasoning?.effort ?? body.reasoning_effort : undefined, maxOutputTokens: body.max_output_tokens ?? body.max_completion_tokens, maxUsd }); });
        try {
            const response = await original(input, init), clone = response.clone();
            append({ type: 'headers', id, status: response.status, headersMs: performance.now() - started });
            void (async () => {
                try {
                    const text = await clone.text();
                    let data;
                    if ((clone.headers.get('content-type') ?? '').includes('text/event-stream')) {
                        for (const line of text.split('\n')) if (line.startsWith('data: ')) { try { const item = JSON.parse(line.slice(6)); if (item.response?.usage || item.usage) data = item; } catch { /* SSE sentinel */ } }
                    } else { try { data = JSON.parse(text); } catch { /* Preserve full reserve. */ } }
                    const measured = response.ok ? measuredProviderCost(provider, data) : null;
                    if (measured) await locked(() => append({ type: 'settle', id, ...measured, durationMs: performance.now() - started }));
                    append({ type: 'complete', id, measured: !!measured, durationMs: performance.now() - started });
                } catch { append({ type: 'unknown', id }); }
            })();
            return response;
        } catch (error) { append({ type: 'unknown', id, error: error.name }); throw error; }
    };
}
