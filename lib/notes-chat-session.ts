import { z } from 'zod';
import type { UIMessage } from 'ai';
import { parseNotesChatScope, serializeNotesChatScope, type NotesChatScopePayload } from '@/lib/notes-chat-scope';

const PREFIX = 'netflux_notes_chat_session:v2:';
const LEGACY_PREFIX = 'netflux_notes_chat_session:v1:';
const MessageSchema = z.object({ id: z.string(), role: z.string(), parts: z.array(z.unknown()).optional() }).passthrough();
const SessionSchema = z.object({ ownerKey: z.string(), activeScope: z.unknown(), messages: z.array(MessageSchema), updatedAt: z.number() });
export interface NotesChatSessionPayload { activeScope: NotesChatScopePayload; messages: UIMessage[]; updatedAt: number }

export function getNotesChatStorageKey(ownerKey: string, signature: string): string {
    return `${PREFIX}${encodeURIComponent(ownerKey)}:${encodeURIComponent(signature)}`;
}
export function clearLegacyNotesChatSessions(): void {
    if (typeof window === 'undefined') return;
    try {
        for (const key of Object.keys(window.sessionStorage)) if (key.startsWith(LEGACY_PREFIX)) window.sessionStorage.removeItem(key);
    } catch { /* Unavailable storage does not prevent chatting. */ }
}
export function clearNotesChatOwner(ownerKey: string): void {
    if (typeof window === 'undefined') return;
    try {
        const prefix = `${PREFIX}${encodeURIComponent(ownerKey)}:`;
        for (const key of Object.keys(window.sessionStorage)) if (key.startsWith(prefix)) window.sessionStorage.removeItem(key);
    } catch { /* Storage may be disabled. */ }
}
export function readNotesChatSession(ownerKey: string, signature: string): NotesChatSessionPayload | null {
    if (typeof window === 'undefined' || !ownerKey || !signature) return null;
    try {
        const raw = window.sessionStorage.getItem(getNotesChatStorageKey(ownerKey, signature));
        if (!raw) return null;
        const parsed = SessionSchema.safeParse(JSON.parse(raw));
        if (!parsed.success || parsed.data.ownerKey !== ownerKey) return null;
        const activeScope = parseNotesChatScope(JSON.stringify(parsed.data.activeScope));
        if (!activeScope || activeScope.signature !== signature) return null;
        return { activeScope, messages: parsed.data.messages as UIMessage[], updatedAt: parsed.data.updatedAt };
    } catch { return null; }
}
export function writeNotesChatSession(ownerKey: string, payload: NotesChatSessionPayload): void {
    if (typeof window === 'undefined' || !ownerKey) return;
    try {
        window.sessionStorage.setItem(getNotesChatStorageKey(ownerKey, payload.activeScope.signature), JSON.stringify({ ...payload, activeScope: JSON.parse(serializeNotesChatScope(payload.activeScope)), ownerKey }));
    } catch { /* Persistence is optional. */ }
}
export function clearNotesChatSession(ownerKey: string, signatures: string | string[]): void {
    if (typeof window === 'undefined') return;
    try {
        for (const signature of typeof signatures === 'string' ? [signatures] : signatures) window.sessionStorage.removeItem(getNotesChatStorageKey(ownerKey, signature));
    } catch { /* Storage may be disabled. */ }
}
