import type { useNoteDraft } from "@/hooks/useNoteDraft";

export function NoteDraftStatus({ draft }: { draft: ReturnType<typeof useNoteDraft> }) {
    if (draft.checking) return <p role="status" className="text-sm text-muted-foreground">Checking the saved note…</p>;
    if (draft.error) return <div role="alert" className="text-sm"><p>{draft.error} Your unfinished edits are kept.</p><button type="button" onClick={draft.refresh} className="underline">Retry</button></div>;
    if (draft.conflict) return <div role="alert" className="space-y-2 text-sm">
        <p>The saved note changed. Its current text is shown below. Your older unfinished edits are kept separately.</p>
        <button type="button" onClick={() => draft.resolve(true)} className="mr-4 underline">Restore unfinished edits</button>
        <button type="button" onClick={() => draft.resolve(false)} className="underline">Discard unfinished edits</button>
    </div>;
    return draft.dirty ? <p role="status" className="text-xs text-muted-foreground">Unfinished edits are kept in this tab. They are not saved as a note.</p> : null;
}
