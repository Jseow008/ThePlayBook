import { z } from "zod";
import type { UIMessage } from "ai";
import type { NotesChatScopePayload } from "@/lib/notes-chat-scope";

const NOTES_CHAT_SESSION_STORAGE_PREFIX = "flux_notes_chat_session:v1:";

const NotesChatScopeSchema = z.object({
    highlightIds: z.array(z.string()),
    noteCount: z.number(),
    totalMatches: z.number(),
    summary: z.string(),
    signature: z.string(),
});

const NotesChatMessageSchema = z.object({
    id: z.string(),
    role: z.string(),
    parts: z.array(z.unknown()).optional(),
    content: z.unknown().optional(),
    metadata: z.unknown().optional(),
}).passthrough();

const NotesChatSessionSchema = z.object({
    activeScope: NotesChatScopeSchema,
    messages: z.array(NotesChatMessageSchema),
    updatedAt: z.number(),
});

export interface NotesChatSessionPayload {
    activeScope: NotesChatScopePayload;
    messages: UIMessage[];
    updatedAt: number;
}

export function getNotesChatStorageKey(signature: string): string {
    return `${NOTES_CHAT_SESSION_STORAGE_PREFIX}${signature}`;
}

export function readNotesChatSession(signature: string): NotesChatSessionPayload | null {
    if (typeof window === "undefined" || !signature) {
        return null;
    }

    const raw = window.sessionStorage.getItem(getNotesChatStorageKey(signature));
    if (!raw) {
        return null;
    }

    try {
        const parsed = NotesChatSessionSchema.safeParse(JSON.parse(raw));
        if (!parsed.success) {
            window.sessionStorage.removeItem(getNotesChatStorageKey(signature));
            return null;
        }

        return {
            activeScope: parsed.data.activeScope,
            messages: parsed.data.messages as UIMessage[],
            updatedAt: parsed.data.updatedAt,
        };
    } catch {
        window.sessionStorage.removeItem(getNotesChatStorageKey(signature));
        return null;
    }
}

export function writeNotesChatSession(
    signatures: string[],
    payload: NotesChatSessionPayload,
): void {
    if (typeof window === "undefined") {
        return;
    }

    const uniqueSignatures = Array.from(new Set(signatures.filter(Boolean)));
    if (uniqueSignatures.length === 0) {
        return;
    }

    const serialized = JSON.stringify(payload);
    uniqueSignatures.forEach((signature) => {
        window.sessionStorage.setItem(getNotesChatStorageKey(signature), serialized);
    });
}

export function clearNotesChatSession(signatures: string | string[]): void {
    if (typeof window === "undefined") {
        return;
    }

    const signatureList = Array.isArray(signatures) ? signatures : [signatures];
    Array.from(new Set(signatureList.filter(Boolean))).forEach((signature) => {
        window.sessionStorage.removeItem(getNotesChatStorageKey(signature));
    });
}
