import type { UserHighlight } from "@/types/database";

export type NoteBaseline = Pick<UserHighlight, "note_body" | "color" | "updated_at">;
export type NoteDraft = { version: 1; owner: string; target: string; baseline: NoteBaseline; note: string; color: string };
const prefix = "netflux-note-draft-v1:";
const memory = new Map<string, NoteDraft>();
const key = (owner: string, target: string) => `${prefix}${owner}:${target}`;

export function sameNoteBaseline(a: NoteBaseline, b: NoteBaseline) {
    return a.note_body === b.note_body && a.color === b.color && a.updated_at === b.updated_at;
}

export function readNoteDraft(owner: string, target: string): NoteDraft | null {
    const name = key(owner, target);
    try {
        const value = sessionStorage.getItem(name);
        if (value) {
            const draft = JSON.parse(value) as NoteDraft;
            if (draft.version === 1 && draft.owner === owner && draft.target === target
                && typeof draft.note === "string" && typeof draft.color === "string" && draft.baseline
                && (draft.baseline.note_body === null || typeof draft.baseline.note_body === "string")
                && (draft.baseline.color === null || typeof draft.baseline.color === "string")
                && (draft.baseline.updated_at === null || typeof draft.baseline.updated_at === "string")) return draft;
        }
    } catch { /* Memory still protects same-tab client navigation when storage is unavailable. */ }
    return memory.get(name) ?? null;
}

export function writeNoteDraft(draft: NoteDraft) {
    const name = key(draft.owner, draft.target);
    memory.set(name, draft);
    try { sessionStorage.setItem(name, JSON.stringify(draft)); return true; }
    catch { return false; }
}

export function removeNoteDraft(owner: string, target: string) {
    const name = key(owner, target);
    memory.delete(name);
    try { sessionStorage.removeItem(name); } catch { /* Storage may be disabled. */ }
}

export function clearNoteDrafts() {
    memory.clear();
    try {
        for (const name of Object.keys(sessionStorage)) if (name.startsWith(prefix)) sessionStorage.removeItem(name);
    } catch { /* Storage may be disabled. */ }
}
