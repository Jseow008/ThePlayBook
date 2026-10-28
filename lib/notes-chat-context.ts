import type { UIMessage } from 'ai';
import { z } from 'zod';
import { parseNotesChatScope, serializeNotesChatScope, type NotesChatScopePayload } from '@/lib/notes-chat-scope';

const PREFIX = 'netflux_notes_chat_context:v1:';
const IdSchema = z.string().regex(/^[a-zA-Z0-9_-]{16,64}$/);
const FailedTurnSchema = z.object({
    attemptId: z.string().uuid().optional(),
    chatId: IdSchema, scopeSignature: z.string(), messageId: z.string().min(1), text: z.string(),
});
const ContextSchema = z.object({
    ownerKey: z.string(), contextId: IdSchema, chatId: IdSchema,
    activeScope: z.unknown(), messages: z.array(z.object({ id: z.string(), role: z.string(), parts: z.array(z.unknown()).optional() }).passthrough()),
    draft: z.object({ text: z.string(), revision: z.number().int().nonnegative() }),
    failedTurn: FailedTurnSchema.nullable().optional().catch(undefined),
    updatedAt: z.number(),
});
export type NotesFailedTurn = z.infer<typeof FailedTurnSchema>;
export interface NotesChatContext {
    contextId: string;
    chatId: string;
    activeScope: NotesChatScopePayload;
    messages: UIMessage[];
    draft: { text: string; revision: number };
    failedTurn?: NotesFailedTurn | null;
    updatedAt: number;
}
// Only a same-tab fallback when sessionStorage is unavailable. Never populated
// on the server; account/session cleanup also removes these entries.
const fallback = new Map<string, NotesChatContext>();
const keyFor = (owner: string, id: string) => `${PREFIX}${encodeURIComponent(owner)}:${id}`;
export function parseNotesContextId(value: string | null | undefined): string | null {
    return IdSchema.safeParse(value).success ? value! : null;
}
export function newNotesChatContext(scope: NotesChatScopePayload): NotesChatContext {
    return { contextId: crypto.randomUUID(), chatId: crypto.randomUUID(), activeScope: scope,
        messages: [], draft: { text: '', revision: 0 }, updatedAt: Date.now() };
}
export function readNotesChatContext(owner: string, id: string): NotesChatContext | null {
    if (typeof window === 'undefined' || !owner || !parseNotesContextId(id)) return null;
    const key = keyFor(owner, id);
    // A failed write contains newer text than the still-readable stored value.
    if (fallback.has(key)) return fallback.get(key)!;
    try {
        const raw = window.sessionStorage.getItem(key);
        if (!raw) return null;
        const result = ContextSchema.safeParse(JSON.parse(raw));
        if (!result.success || result.data.ownerKey !== owner || result.data.contextId !== id) return null;
        const scope = parseNotesChatScope(JSON.stringify(result.data.activeScope));
        if (!scope) return null;
        const messages = result.data.messages as UIMessage[];
        const last = messages.at(-1);
        const failed = result.data.failedTurn;
        // Retry hints cannot attach to another chat/scope or a completed turn.
        const failedTurn = failed && failed.chatId === result.data.chatId && failed.scopeSignature === scope.signature
            && last?.role === 'user' && last.id === failed.messageId
            && last.parts?.flatMap(part => part?.type === 'text' && typeof part.text === 'string' ? [part.text] : []).join('') === failed.text.trim()
            ? failed : undefined;
        return { ...result.data, activeScope: scope, messages, failedTurn };
    } catch { return null; }
}
export function writeNotesChatContext(owner: string, context: NotesChatContext): boolean {
    if (typeof window === 'undefined' || !owner) return false;
    const key = keyFor(owner, context.contextId);
    try {
        window.sessionStorage.setItem(key, JSON.stringify({ ...context, activeScope: JSON.parse(serializeNotesChatScope(context.activeScope)), ownerKey: owner }));
        fallback.delete(key);
        return true;
    } catch {
        fallback.set(key, context);
        return false;
    }
}
export function findFallbackNotesChatContext(owner: string, signature: string): NotesChatContext | null {
    const prefix = `${PREFIX}${encodeURIComponent(owner)}:`;
    return [...fallback.entries()].filter(([key, value]) => key.startsWith(prefix) && value.activeScope.signature === signature)
        .map(([, value]) => value).sort((a, b) => b.updatedAt - a.updatedAt)[0] ?? null;
}
export function clearNotesChatContexts(owner?: string): void {
    const prefix = owner ? `${PREFIX}${encodeURIComponent(owner)}:` : PREFIX;
    for (const key of fallback.keys()) if (key.startsWith(prefix)) fallback.delete(key);
    if (typeof window === 'undefined') return;
    try {
        for (const key of Object.keys(window.sessionStorage)) if (key.startsWith(prefix)) window.sessionStorage.removeItem(key);
    } catch { /* Owner checks still reject unavailable prior-owner storage. */ }
}
export function withNotesContext(href: string, contextId: string): string {
    const url = new URL(href, 'https://notes.invalid');
    url.searchParams.set('notesContext', contextId);
    return `${url.pathname}${url.search}${url.hash}`;
}
