"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { useAuthSessionIdentity } from "@/hooks/useAuthUser";
import { normalizeHighlightColor, type HighlightColor } from "@/lib/highlight-utils";
import { readNoteDraft, removeNoteDraft, sameNoteBaseline, writeNoteDraft, type NoteBaseline, type NoteDraft } from "@/lib/note-draft";

type Target = NoteBaseline & { id: string; user_id?: string; isNew?: boolean };
type State = { scope: string; baseline: NoteBaseline; note: string; color: HighlightColor; ready: boolean; error: string | null; recovered: NoteDraft | null };

/** Preserves unfinished text only. All server writes still require explicit Save. */
export function useNoteDraft(target: Target | null) {
    const { user, sessionEpoch } = useAuthSessionIdentity();
    const owner = user?.id;
    const targetId = target?.id;
    const ownsTarget = Boolean(owner && (!target?.user_id || target.user_id === owner));
    const scope = ownsTarget && owner && targetId ? `${owner}:${sessionEpoch}:${targetId}` : "";
    const identity = useRef(scope);
    useLayoutEffect(() => { identity.current = scope; }, [scope]);
    const [revision, setRevision] = useState(0);
    const [state, setState] = useState<State | null>(null);
    const sourceNote = target?.note_body ?? null;
    const sourceColor = target?.color ?? null;
    const sourceUpdatedAt = target?.updated_at ?? null;
    const isNew = target?.isNew ?? false;

    useEffect(() => {
        if (!owner || !targetId || !scope) { setState(null); return; }
        let live = true;
        const controller = new AbortController();
        const source = { note_body: sourceNote, color: sourceColor, updated_at: sourceUpdatedAt };
        const saved = readNoteDraft(owner, targetId);
        const install = (row: NoteBaseline) => {
            const baseline = { note_body: row.note_body, color: row.color, updated_at: row.updated_at };
            if (!live || identity.current !== scope) return;
            const conflict = saved && !sameNoteBaseline(saved.baseline, baseline);
            setState({ scope, baseline, note: saved && !conflict ? saved.note : baseline.note_body ?? "",
                color: normalizeHighlightColor(saved && !conflict ? saved.color : baseline.color),
                ready: true, error: null, recovered: conflict ? saved : null });
        };
        setState(null);
        if (isNew) install({ note_body: source.note_body, color: source.color, updated_at: source.updated_at });
        else void (async () => {
            try {
                const res = await fetch(`/api/library/highlights/${targetId}`, { cache: "no-store", signal: controller.signal });
                if (!res.ok) throw new Error(res.status === 404 ? "This saved passage is no longer available." : "Could not check the saved note. Retry before saving.");
                const { data } = await res.json();
                if (data.user_id !== owner || data.id !== targetId) throw new Error("This saved passage is no longer available.");
                install(data);
            } catch (error) {
                if (!live || identity.current !== scope || controller.signal.aborted) return;
                setState({ scope, baseline: source, note: saved?.note ?? "", color: normalizeHighlightColor(saved?.color ?? source.color),
                    ready: false, recovered: null, error: error instanceof Error ? error.message : "Could not check the saved note." });
            }
        })();
        return () => { live = false; controller.abort(); };
    }, [owner, targetId, scope, revision, sourceNote, sourceColor, sourceUpdatedAt, isNew]);

    const current = state?.scope === scope ? state : null;
    const dirty = Boolean(current && (current.note.trim() !== (current.baseline.note_body ?? "").trim()
        || current.color !== normalizeHighlightColor(current.baseline.color)));
    const change = (updates: Partial<Pick<State, "note" | "color">>) => {
        if (!current || !owner || !targetId || identity.current !== scope) return;
        const next = { ...current, ...updates };
        // Never replace a retained older draft until the user resolves its conflict.
        if (current.recovered) return;
        writeNoteDraft({ version: 1, owner, target: targetId, baseline: next.baseline, note: next.note, color: next.color });
        setState(next);
    };
    const discard = () => {
        if (owner && targetId) removeNoteDraft(owner, targetId);
    };
    useEffect(() => {
        if (!dirty) return;
        const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ""; };
        window.addEventListener("beforeunload", warn);
        return () => window.removeEventListener("beforeunload", warn);
    }, [dirty]);

    return {
        note: current?.note ?? "", color: current?.color ?? normalizeHighlightColor(target?.color), dirty,
        ready: Boolean(current?.ready && !current.recovered), error: current?.error,
        checking: Boolean(scope && !current), conflict: Boolean(current?.recovered),
        owner, ownsTarget, expected: current?.baseline,
        setNote: (note: string) => change({ note }), setColor: (color: HighlightColor) => change({ color }),
        discard, refresh: () => setRevision(value => value + 1),
        resolve: (restore: boolean) => {
            if (!current?.recovered || !owner || !targetId) return;
            const next = { ...current, recovered: null, note: restore ? current.recovered.note : current.baseline.note_body ?? "",
                color: normalizeHighlightColor(restore ? current.recovered.color : current.baseline.color) };
            if (restore) writeNoteDraft({ version: 1, owner, target: targetId, baseline: next.baseline, note: next.note, color: next.color });
            else discard();
            setState(next);
        },
    };
}
