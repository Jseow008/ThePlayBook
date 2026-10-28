import 'server-only';
import { z } from 'zod';
import type { createClient } from '@/lib/supabase/server';
import type { PersonalEvidenceCandidate, PersonalEvidenceScope } from '@/lib/personal-evidence';
import { loadSelectedPersonalEvidence } from './personal-evidence-candidates';
import { assertActiveChatSession } from './personal-retrieval-session';
import { decryptReplay, encryptReplay, EncryptedReplaySchema, replayFingerprint, replayKeys } from './notes-replay-crypto';
import { notesReplayRpc, NotesReplayUnavailable, withNotesReplayOwner } from './notes-replay-context';

export const NotesReplayIdentitySchema = z.object({ expectedOwner: z.string().min(1).max(200), chatId: z.string().min(1).max(128), questionId: z.string().min(1).max(128),
    attemptId: z.string().uuid(), retryOf: z.string().uuid().optional() }).strict();
const resultSchema = z.object({ state: z.string().optional(), ownerNonce: z.string().uuid().optional(),
    cache: EncryptedReplaySchema.nullish(), valid: z.boolean().optional(), published: z.boolean().optional(),
    code: z.string().optional(), status: z.number().optional(), serverTime: z.number().int().optional() });
const manifestEntry = z.object({ type: z.enum(['highlight','reflection']), id: z.guid(), fingerprint: z.string().regex(/^[a-f0-9]{64}$/) });
const wireSchema = z.object({ body: z.string(), contentType: z.string().max(128), ui: z.boolean(), evidence: z.array(manifestEntry).max(64) });
type Client = Awaited<ReturnType<typeof createClient>>;
const waiting = 'Your previous attempt is still processing. You can wait, or try again. Trying again starts a new attempt and may cause additional AI processing.';
const uncertain = 'We couldn’t confirm whether your previous attempt finished. It may still be processing. Trying again starts a new attempt and may cause additional AI processing.';
function failure(code: string, message: string, status = 409, serverTime?: number) {
    return Response.json({ error: { code, message, ...(serverTime === undefined ? {} : { serverTime }) } }, { status, headers: { 'Cache-Control': 'no-store', ...(code === 'ASK_ATTEMPT_IN_PROGRESS' ? { 'Retry-After': '2' } : {}) } });
}
const unavailable = () => failure('ASK_ATTEMPT_RESULT_UNAVAILABLE','This result cannot be safely reused. Your question is preserved. Try again to start a new attempt.',410);
async function freshEvidence(client: Client, userId: string, scope: PersonalEvidenceScope,
    manifest: z.infer<typeof manifestEntry>[], key: string, signal: AbortSignal) {
    const { data, error } = await client.auth.getUser();
    if (error || data.user?.id !== userId) throw new NotesReplayUnavailable(true);
    await assertActiveChatSession({ supabase: client, signal });
    const loaded = await loadSelectedPersonalEvidence({ supabase: client, userId, scope, selected: manifest, signal });
    if (loaded.length !== manifest.length || loaded.some((item,index) => replayFingerprint(key,'evidence',item.fingerprint) !== manifest[index].fingerprint)) throw new Error('Replay evidence unavailable');
}

/** Wrap the actual route, not the provider SDK: transport copies never reach admission. */
export async function withNotesReplayRequest(options: {
    client: Client; userId: string; replay: unknown; submittedQuestionId?: string; request: unknown; scope: PersonalEvidenceScope; signal: AbortSignal;
}, run: (rememberEvidence: (items: readonly PersonalEvidenceCandidate[]) => void) => Promise<Response>): Promise<Response> {
    const identity = NotesReplayIdentitySchema.safeParse(options.replay);
    if (!identity.success || identity.data.questionId !== options.submittedQuestionId) return failure('ASK_ATTEMPT_REQUIRED','Refresh Ask before sending this question. Your draft is preserved.',400);
    let owner: { userId: string; sessionId: string; chatId: string; questionId: string; attemptId: string; ownerNonce: string } | undefined;
    try {
        const { data, error } = await options.client.auth.getClaims();
        const claims = z.object({ sub: z.string().uuid(), session_id: z.string().uuid() }).safeParse(data?.claims);
        if (error || !claims.success || claims.data.sub !== options.userId
            || identity.data.expectedOwner !== JSON.stringify([options.userId, claims.data.session_id])) throw new NotesReplayUnavailable(true);
        const context = { userId: options.userId, sessionId: claims.data.session_id, ...identity.data };
        // retryOf is immutable input but not part of ciphertext namespace.
        const namespace = { userId: context.userId, sessionId: context.sessionId, chatId: context.chatId, questionId: context.questionId, attemptId: context.attemptId };
        const keys = replayKeys();
        const fingerprints = Object.fromEntries(Object.entries(keys.fingerprint).map(([id,key]) => [id,replayFingerprint(key,'request',options.request)]));
        const claimInput = { ...context, keyId: keys.fingerprintCurrent, fingerprints };
        let result = resultSchema.parse(await notesReplayRpc('claim',claimInput,options.signal));
        const observeUntil = performance.now() + 1_500;
        while (result.state === 'running' && performance.now() < observeUntil) {
            await new Promise<void>(resolve => setTimeout(resolve,150));
            options.signal.throwIfAborted();
            const remaining = Math.floor(observeUntil-performance.now());
            if (remaining < 50) break;
            try { result = resultSchema.parse(await notesReplayRpc('claim',claimInput,AbortSignal.any([options.signal,AbortSignal.timeout(remaining)]))); }
            catch (error) {
                if (error instanceof NotesReplayUnavailable && error.unauthorized) throw error;
                if (!options.signal.aborted && performance.now() >= observeUntil) break;
                throw error;
            }
        }
        if (result.state === 'running') return failure('ASK_ATTEMPT_IN_PROGRESS',waiting);
        if (result.state === 'uncertain') return failure('ASK_ATTEMPT_OUTCOME_UNCERTAIN',uncertain);
        if (result.state === 'conflict') return failure('ASK_ATTEMPT_CONFLICT','This attempt belongs to a different question or scope. Your draft is preserved.');
        if (result.state === 'superseded') return failure('ASK_ATTEMPT_SUPERSEDED','A newer attempt is active. This result will not replace it.');
        if (result.state === 'expired') return failure('ASK_ATTEMPT_EXPIRED','This attempt is too old or its clock is out of range. Your question is preserved. Try again explicitly to use the verified server time.',410,result.serverTime);
        if (result.state === 'failed') return failure(result.code ?? 'RETRIEVAL_UNAVAILABLE','The previous attempt did not complete. Your question is preserved. Try again to start a new attempt.',result.status ?? 503);
        if (result.state === 'completed') {
            if (!result.cache) return unavailable();
            try {
                const wire = wireSchema.parse(JSON.parse(decryptReplay(result.cache,namespace,fingerprints)));
                const evidenceKey = keys.fingerprint[result.cache.fingerprintKeyId];
                if (!evidenceKey) return unavailable();
                await freshEvidence(options.client,options.userId,options.scope,wire.evidence,evidenceKey,options.signal);
                const check = resultSchema.parse(await notesReplayRpc('check',context,options.signal));
                if (!check.valid) return unavailable();
                options.signal.throwIfAborted();
                return new Response(wire.body, { headers: { 'Content-Type':wire.contentType,'Cache-Control':'no-store',
                    'x-notes-attempt-id':context.attemptId, ...(wire.ui ? { 'x-vercel-ai-ui-message-stream':'v1' } : {}) } });
            } catch (error) {
                if (error instanceof NotesReplayUnavailable && error.unauthorized) throw error;
                return unavailable();
            }
        }
        if (result.state !== 'owner' || !result.ownerNonce) throw new NotesReplayUnavailable();
        owner = { ...namespace, ownerNonce:result.ownerNonce };
        const owned = owner;
        const evidence: PersonalEvidenceCandidate[] = [];
        return await withNotesReplayOwner(owned,async () => {
            const response = await run(items => { evidence.splice(0,evidence.length,...items); });
            // A provider/route error after browser interruption is not proof that
            // the original stopped processing. Preserve an uncertain outcome.
            options.signal.throwIfAborted();
            if (!response.ok) {
                const parsed = z.object({ error: z.object({ code: z.string() }) }).safeParse(await response.clone().json().catch(() => null));
                const code = parsed.success && ['AI_QUOTA_EXCEEDED','AI_BUDGET_EXCEEDED','AI_TEMPORARILY_UNAVAILABLE','RETRIEVAL_NOT_READY','RETRIEVAL_UNAVAILABLE','INTERNAL_ERROR'].includes(parsed.data.error.code)
                    ? parsed.data.error.code : 'INTERNAL_ERROR';
                await notesReplayRpc('fail',{ ...owned,code,status:[429,500,503].includes(response.status) ? response.status : 503 },AbortSignal.timeout(2_000));
                return response;
            }
            const manifest = evidence.map(item => ({ type:item.type,id:item.id,fingerprint:replayFingerprint(keys.fingerprint[keys.fingerprintCurrent],'evidence',item.fingerprint) }));
            await freshEvidence(options.client,options.userId,options.scope,manifest,keys.fingerprint[keys.fingerprintCurrent],options.signal);
            // Only bounded, complete local extract responses enter the replay cache.
            const reader = response.clone().body?.getReader(), chunks: Uint8Array[] = [];
            let length = 0, oversized = false;
            if (reader) while (true) {
                const next = await reader.read();
                if (next.done) break;
                length += next.value.byteLength;
                if (length > 262144) { oversized=true; void reader.cancel(); break; }
                chunks.push(next.value);
            }
            const serialized = oversized ? '' : JSON.stringify({ body:Buffer.concat(chunks).toString('utf8'),contentType:response.headers.get('content-type') ?? 'text/plain; charset=utf-8',
                ui:response.headers.get('x-vercel-ai-ui-message-stream') === 'v1',evidence:manifest });
            const cacheBytes = Buffer.byteLength(serialized);
            let cache = null;
            try { cache = serialized && cacheBytes <= 262144 ? encryptReplay(serialized,namespace,fingerprints[keys.fingerprintCurrent]) : null; }
            catch { /* Deliver a fresh authorized answer with a nonreplayable tombstone. */ }
            const finished = resultSchema.parse(await notesReplayRpc('finish',{ ...owned,cache,cacheBytes:cache ? cacheBytes : 0 },options.signal));
            if (!finished.published) return failure('ASK_ATTEMPT_SUPERSEDED','A newer attempt is active. This result will not replace it.');
            response.headers.set('x-notes-attempt-id',context.attemptId);
            return response;
        });
    } catch (error) {
        if (owner) await notesReplayRpc('fail',{ ...owner,code:'OUTCOME_UNCERTAIN',status:409 },AbortSignal.timeout(2_000)).catch(() => {});
        options.signal.throwIfAborted();
        // Never log a request, decrypted answer, raw exception or key configuration.
        if (error instanceof NotesReplayUnavailable && error.unauthorized) return failure('UNAUTHORIZED','Your chat session has ended. Please sign in again.',401);
        return failure('ASK_ATTEMPT_UNAVAILABLE','We couldn’t verify this attempt. It may still be processing. Your question is preserved. Trying again starts a new attempt and may cause additional AI processing.',503);
    }
}
