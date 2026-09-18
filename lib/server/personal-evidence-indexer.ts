import "server-only";
import { z } from "zod";
import { getAdminClient } from "@/lib/supabase/admin";
import { chunkPersonalEvidenceText, PERSONAL_EMBEDDING_DIMENSIONS, PERSONAL_EMBEDDING_MODEL, type PersonalEvidenceTextField } from "@/lib/server/personal-evidence-ranking";

const INDEX_VERSION = "gemini-embedding-001:768:personal-v1";
const WorkerLeaseSchema = z.object({ worker_token: z.string().uuid(), worker_expires_at: z.string().datetime({ offset: true }) });
const ClaimSchema = z.object({
    evidence_type: z.enum(["highlight", "reflection"]), evidence_id: z.string().uuid(), revision: z.string().uuid(),
    lease_token: z.string().uuid(), index_version: z.string(), attempts: z.number().int().min(0).max(1_000),
    highlighted_text: z.string().nullable(), note_body: z.string().nullable(),
    prompt: z.string().nullable(), reflection_text: z.string().nullable(),
});
type Claim = z.infer<typeof ClaimSchema>;
class TerminalInputFailure extends Error {}
type RpcResult = { data: unknown; error: unknown };
export type IndexRpc = (name: string, args: Record<string, unknown>, signal: AbortSignal) => Promise<RpcResult>;
export type IndexEmbedder = (texts: string[], signal: AbortSignal) => Promise<number[][]>;
class ProviderFailure extends Error {
    constructor(readonly retryAfterSeconds: number, readonly rateLimited: boolean) { super("Embedding provider unavailable"); }
}
function retryDelay(response: Response, body: unknown): number {
    const value = response.headers.get("retry-after");
    const seconds = value === null ? NaN : Number(value);
    const dateSeconds = value ? (Date.parse(value) - Date.now()) / 1000 : NaN;
    const details = (body as { error?: { details?: { retryDelay?: string }[] } })?.error?.details;
    const bodySeconds = Math.max(0, ...(details ?? []).map(detail => Number(detail.retryDelay?.replace(/s$/, "")) || 0));
    return Math.ceil(Math.max(60, Number.isFinite(seconds) ? seconds : 0, Number.isFinite(dateSeconds) ? dateSeconds : 0, bodySeconds));
}
/** Direct transport deliberately has no automatic retry and retains provider backoff headers. */
export function createIndexEmbedder(apiKey: string): IndexEmbedder {
    return async (texts, signal) => {
        const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${PERSONAL_EMBEDDING_MODEL}:batchEmbedContents`, {
            method: "POST", signal, headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
            body: JSON.stringify({ requests: texts.map(text => ({ model: `models/${PERSONAL_EMBEDDING_MODEL}`, content: { parts: [{ text }] }, outputDimensionality: PERSONAL_EMBEDDING_DIMENSIONS })) }),
        });
        const body = await response.json().catch(() => null);
        if (!response.ok) throw new ProviderFailure(retryDelay(response, body), response.status === 429);
        return (body?.embeddings ?? []).map((entry: { values?: number[] }) => entry.values ?? []);
    };
}
const defaultRpc: IndexRpc = async (name, args, signal) => {
    // Keep the injectable transport narrow; every worker RPC is service-only.
    const client = getAdminClient() as unknown as { rpc: (name: string, args: Record<string, unknown>) => { abortSignal: (signal: AbortSignal) => PromiseLike<RpcResult> } };
    return await client.rpc(name, args).abortSignal(signal);
};
function identity(claim: Claim) {
    return { p_evidence_type: claim.evidence_type, p_evidence_id: claim.evidence_id, p_revision: claim.revision, p_lease_token: claim.lease_token };
}
export async function processPersonalEvidenceIndex(options: { signal?: AbortSignal; rpc?: IndexRpc; embed?: IndexEmbedder; timeoutMs?: number } = {}) {
    const rpc = options.rpc ?? defaultRpc;
    const apiKey = process.env.GEMINI_API_KEY;
    if (!options.embed && !apiKey) throw new Error("Personal index provider configuration missing");
    const embed = options.embed ?? createIndexEmbedder(apiKey!);
    const startedAt = Date.now();
    const timeoutMs = options.timeoutMs ?? 40_000;
    const signal = AbortSignal.any([AbortSignal.timeout(timeoutMs), ...(options.signal ? [options.signal] : [])]);
    const call = async (name: string, args: Record<string, unknown>, requestSignal = signal) => {
        requestSignal.throwIfAborted();
        const result = await rpc(name, args, requestSignal);
        if (result.error) throw new Error("Personal index database operation failed");
        return result.data;
    };
    const result = { claimed: 0, completed: 0, stale: 0, deferred: 0, failed: 0, retryAfterSeconds: 0, stopReason: "batch_limit" };
    const admission = await call("acquire_personal_evidence_worker", { p_lease_seconds: 90 });
    if (admission === null) return { ...result, stopReason: "worker_busy_or_provider_cooldown" };
    const lease = WorkerLeaseSchema.parse(admission);
    try {
        await call("seed_personal_evidence_index", { p_limit: 500 });
        while (result.claimed < 20) {
            if (signal.aborted || Date.now() - startedAt >= timeoutMs - 1_000) {
                result.stopReason = "deadline_or_cancelled";
                break;
            }
            const claims = z.array(ClaimSchema).max(2).parse(await call("claim_personal_evidence_index", { p_worker_token: lease.worker_token, p_limit: 2, p_lease_seconds: 90 }));
            if (!claims.length) { result.stopReason = "no_claim_available"; break; }
            result.claimed += claims.length;
            for (let index = 0; index < claims.length; index++) {
                const claim = claims[index];
                try {
                    signal.throwIfAborted();
                    if (claim.index_version !== INDEX_VERSION) throw new TerminalInputFailure("Unsupported personal index version");
                    const fields: [PersonalEvidenceTextField, string | null][] = claim.evidence_type === "highlight"
                        ? [["highlightedText", claim.highlighted_text], ["noteBody", claim.note_body]]
                        : [["prompt", claim.prompt], ["reflectionText", claim.reflection_text]];
                    if (fields.reduce((sum, [, text]) => sum + Buffer.byteLength(text ?? "", "utf8"), 0) > 64 * 1024) throw new TerminalInputFailure("Personal index record exceeds byte bound");
                    const chunks = fields.flatMap(([field, text]) => !text?.trim() ? [] : chunkPersonalEvidenceText(text).map((chunk, chunk_index) => ({ field, chunk_index, start_offset: chunk.start, end_offset: chunk.end, text: chunk.text })));
                    if (chunks.length > 64) throw new TerminalInputFailure("Personal index record exceeds chunk bound");
                    const payload = [];
                    for (let offset = 0; offset < chunks.length; offset += 2) {
                        signal.throwIfAborted();
                        const batch = chunks.slice(offset, offset + 2);
                        const vectors = await embed(batch.map(chunk => chunk.text), signal);
                        signal.throwIfAborted();
                        if (vectors.length !== batch.length || vectors.some(vector => vector.length !== PERSONAL_EMBEDDING_DIMENSIONS || !vector.every(Number.isFinite) || !Number.isFinite(Math.hypot(...vector)) || Math.hypot(...vector) === 0)) throw new Error("Invalid personal index embedding");
                        payload.push(...batch.map((chunk, i) => ({ field: chunk.field, chunk_index: chunk.chunk_index, start_offset: chunk.start_offset, end_offset: chunk.end_offset, embedding: vectors[i] })));
                    }
                    const completed = await call("complete_personal_evidence_index", { ...identity(claim), p_chunks: payload });
                    if (completed === true) result.completed++;
                    else if (completed === false) result.stale++;
                    else throw new Error("Invalid personal index completion response");
                } catch (error) {
                    if (error instanceof TerminalInputFailure) {
                        await call("fail_personal_evidence_index", { ...identity(claim), p_retry_after_seconds: 60, p_terminal: true }, AbortSignal.timeout(3_000));
                        result.failed++;
                        continue;
                    }
                    const delay = error instanceof ProviderFailure ? error.retryAfterSeconds : Math.min(3600, 60 * 2 ** Math.min(6, Math.max(0, claim.attempts - 1)));
                    result.retryAfterSeconds = delay;
                    // A separate, short cleanup budget releases leases even after the processing deadline/request cancellation.
                    const cleanupSignal = AbortSignal.timeout(3_000);
                    for (const remaining of claims.slice(index)) {
                        await call("fail_personal_evidence_index", { ...identity(remaining), p_retry_after_seconds: delay, p_terminal: false, p_rate_limited: error instanceof ProviderFailure && error.rateLimited }, cleanupSignal);
                        result.deferred++;
                    }
                    result.stopReason = signal.aborted ? "deadline_or_cancelled" : "deferred";
                    return result;
                }
            }
        }
        return result;
    } finally {
        // This token is independent of captures: edits and deletes cannot admit
        // a second provider request while this invocation is still in flight.
        await call("release_personal_evidence_worker", { p_worker_token: lease.worker_token }, AbortSignal.timeout(3_000));
    }
}
