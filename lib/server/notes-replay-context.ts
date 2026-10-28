import 'server-only';
import { AsyncLocalStorage } from 'node:async_hooks';
import { getAdminClient } from '@/lib/supabase/admin';
import type { Json } from '@/types/database';

export type NotesReplayOwner = { userId: string; sessionId: string; chatId: string; questionId: string; attemptId: string; ownerNonce: string };
const context = new AsyncLocalStorage<NotesReplayOwner>();
export const notesReplayOwner = () => context.getStore();
export const withNotesReplayOwner = <T>(owner: NotesReplayOwner, run: () => T): T => context.run(owner, run);
export class NotesReplayUnavailable extends Error {
    constructor(readonly unauthorized = false) { super('Notes replay verification unavailable'); }
}
export async function notesReplayRpc(action: string, input: { [key: string]: Json | undefined }, signal: AbortSignal): Promise<Json> {
    const { data, error } = await getAdminClient().rpc('notes_replay', { p_action: action, p_input: input })
        .abortSignal(AbortSignal.any([signal, AbortSignal.timeout(['admit','reserve','settle'].includes(action) ? 10_000 : 2_000)]));
    if (error || data === null) throw new NotesReplayUnavailable(error?.code === '42501');
    return data;
}
