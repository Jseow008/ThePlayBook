"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import type { PublishedContentOption } from "@/lib/server/content-requests";

type Preview = {
    source: { title: string; updated_at: string };
    replacement: { id: string; title: string; updated_at: string };
    preserved: { libraryRecords: number; highlights: number; reflections: number };
};

export function ReplaceContentPanel({ contentId, options }: { contentId: string; options: PublishedContentOption[] }) {
    const router = useRouter();
    const [replacementId, setReplacementId] = useState("");
    const [search, setSearch] = useState("");
    const visibleOptions = options.filter((option) => option.id !== contentId && (option.id === replacementId || `${option.title} ${option.author ?? ""}`.toLowerCase().includes(search.trim().toLowerCase())));
    const [preview, setPreview] = useState<Preview | null>(null);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);

    async function submit(confirm: boolean) {
        setBusy(true);
        setError(null);
        try {
            const response = await fetch(`/api/admin/content/${contentId}/replacement${confirm ? "" : `?replacementId=${encodeURIComponent(replacementId.trim())}`}`, {
                method: confirm ? "POST" : "GET",
                ...(confirm && preview ? { headers: { "Content-Type": "application/json" }, body: JSON.stringify({
                    replacementId: preview.replacement.id, sourceUpdatedAt: preview.source.updated_at,
                    replacementUpdatedAt: preview.replacement.updated_at,
                }) } : {}),
            });
            const result = await response.json();
            if (!response.ok) {
                if (confirm) setPreview(null);
                throw new Error(result.error?.message ?? "Could not replace summary");
            }
            if (confirm) {
                toast.success("Summary replaced. Original reading history preserved.");
                router.push("/admin/content");
                router.refresh();
            } else setPreview(result);
        } catch (failure) {
            setError(failure instanceof Error ? failure.message : "Could not replace summary");
        } finally { setBusy(false); }
    }

    return (
        <details className="rounded-xl border border-zinc-200 bg-white p-5">
            <summary className="cursor-pointer font-medium text-zinc-900">Replace a duplicate summary</summary>
            <p className="mt-3 text-sm text-zinc-600">
                Keep the original reading history, notes and highlights. Readers will see a link to the kept summary.
                Reading and listening positions stay with their original version.
            </p>
            <label htmlFor="replacement-search" className="mt-4 block text-sm font-medium text-zinc-900">Find the kept summary</label>
            <input id="replacement-search" type="search" value={search} onChange={(event) => setSearch(event.target.value)}
                className="mt-1 w-full rounded-lg border border-zinc-300 px-3 py-2 text-zinc-900" placeholder="Search by title or author" />
            <label htmlFor="replacement-summary" className="mt-3 block text-sm font-medium text-zinc-900">Kept summary</label>
            <select id="replacement-summary" value={replacementId} disabled={busy}
                onChange={(event) => { setReplacementId(event.target.value); setPreview(null); }}
                className="mt-1 w-full min-w-0 rounded-lg border border-zinc-300 px-3 py-2 text-zinc-900">
                <option value="">Choose a published summary</option>
                {visibleOptions.map((option) => <option key={option.id} value={option.id}>
                    {option.title}{option.author ? ` — ${option.author}` : ""} ({option.type})
                </option>)}
            </select>
            <button type="button" disabled={busy || !replacementId.trim()} onClick={() => void submit(false)}
                className="mt-3 rounded-lg bg-zinc-900 px-4 py-2 text-sm text-white disabled:opacity-50">
                {busy ? "Working…" : "Preview replacement"}
            </button>
            {error && <p role="alert" className="mt-3 text-sm text-red-700">{error}</p>}
            {preview && <div className="mt-4 space-y-3 text-sm text-zinc-700">
                <p>Replace “{preview.source.title}” with “{preview.replacement.title}”.</p>
                <p>Preserve {preview.preserved.libraryRecords} library records, {preview.preserved.highlights} highlights and {preview.preserved.reflections} reflections on the original summary.</p>
                <p>Existing progress on the kept summary stays unchanged. The original summary becomes a read-only archive; it is not permanently deleted.</p>
                <button type="button" disabled={busy} onClick={() => void submit(true)}
                    className="rounded-lg bg-zinc-900 px-4 py-2 text-white disabled:opacity-50">Confirm replacement</button>
            </div>}
        </details>
    );
}
