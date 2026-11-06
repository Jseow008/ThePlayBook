import type { UIMessage } from 'ai';
import { z } from 'zod';

const PREFIX = 'netflux_library_chat:v1:';
const MessageSchema = z.object({
    id: z.string().min(1), role: z.enum(['system', 'user', 'assistant']),
    parts: z.array(z.object({ type: z.string() }).passthrough()),
}).passthrough();
const FailureSchema = z.object({ questionId: z.string().min(1), message: z.string().min(1) });
const SessionSchema = z.object({
    ownerKey: z.string().min(1), chatId: z.string().uuid(),
    messages: z.array(MessageSchema), draft: z.string(),
    failure: FailureSchema.nullable(), pendingQuestionId: z.string().nullable(),
});
export interface LibraryChatSession {
    chatId: string;
    messages: UIMessage[];
    draft: string;
    failure: { questionId: string; message: string } | null;
    pendingQuestionId: string | null;
}

// Same-document fallback only. It is purged along with durable state on sign-out.
const fallback = new Map<string, LibraryChatSession>();
const keyFor = (owner: string) => `${PREFIX}${encodeURIComponent(owner)}`;

export function newLibraryChatSession(): LibraryChatSession {
    return { chatId: crypto.randomUUID(), messages: [], draft: '', failure: null, pendingQuestionId: null };
}

export function readLibraryChatSession(owner: string): LibraryChatSession | null {
    if (typeof window === 'undefined' || !owner) return null;
    let value: LibraryChatSession;
    const memory = fallback.get(keyFor(owner));
    if (memory) value = memory;
    else {
        try {
            const raw = window.sessionStorage.getItem(keyFor(owner));
            if (!raw) return null;
            const parsed = SessionSchema.safeParse(JSON.parse(raw));
            if (!parsed.success || parsed.data.ownerKey !== owner) return null;
            value = { ...parsed.data, messages: parsed.data.messages as UIMessage[] };
        } catch { return null; }
    }
    const last = value.messages.at(-1);
    // A return/reload never resumes a request or treats an unfinished answer as final.
    const failure = last?.role === 'user' && value.pendingQuestionId === last.id
        ? { questionId: last.id, message: 'The previous response was interrupted. Please try again.' }
        : last?.role === 'user' && value.failure?.questionId === last.id ? value.failure : null;
    return { ...value, pendingQuestionId: null, failure };
}

export function writeLibraryChatSession(owner: string, value: LibraryChatSession): boolean {
    if (typeof window === 'undefined' || !owner) return false;
    try {
        window.sessionStorage.setItem(keyFor(owner), JSON.stringify({ ...value, ownerKey: owner }));
        fallback.delete(keyFor(owner));
        return true;
    } catch {
        fallback.set(keyFor(owner), value);
        return false;
    }
}

export function clearLibraryChatSessions(owner?: string): void {
    if (owner) fallback.delete(keyFor(owner));
    else fallback.clear();
    if (typeof window === 'undefined') return;
    try {
        if (owner) window.sessionStorage.removeItem(keyFor(owner));
        else for (const key of Object.keys(window.sessionStorage)) {
            if (key.startsWith(PREFIX)) window.sessionStorage.removeItem(key);
        }
    } catch { /* Verified owner/session checks still reject another identity. */ }
}
