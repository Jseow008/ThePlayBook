export interface NotesChatScopePayload {
    highlightIds: string[];
    noteCount: number;
    totalMatches: number;
    summary: string;
    signature: string;
}

function isNotesChatScopePayload(value: unknown): value is NotesChatScopePayload {
    if (!value || typeof value !== "object") return false;

    const candidate = value as Record<string, unknown>;
    return (
        Array.isArray(candidate.highlightIds)
        && candidate.highlightIds.every((id) => typeof id === "string")
        && typeof candidate.noteCount === "number"
        && typeof candidate.totalMatches === "number"
        && typeof candidate.summary === "string"
        && typeof candidate.signature === "string"
    );
}

export function serializeNotesChatScope(scope: NotesChatScopePayload): string {
    return JSON.stringify(scope);
}

export function parseNotesChatScope(value?: string): NotesChatScopePayload | null {
    if (!value) return null;

    try {
        const parsed = JSON.parse(value) as unknown;
        return isNotesChatScopePayload(parsed) ? parsed : null;
    } catch {
        return null;
    }
}
