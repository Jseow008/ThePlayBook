"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

type Review = {
    source: { id: string; title: string; updated_at: string };
    replacement: { id: string; title: string; updated_at: string };
    preserved: { libraryRecords: number; highlights: number; reflections: number };
};

type Props = { contentId: string } & (
    { mode: "create"; updatedAt: string } | { mode: "publish"; updatedAt?: never }
);

export function ContentVersionActions(props: Props) {
    const router = useRouter();
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState("");
    const [review, setReview] = useState<Review | null>(null);

    useEffect(() => {
        if (props.mode !== "publish") return;
        let active = true;
        fetch(`/api/admin/content/${props.contentId}/version`, { cache: "no-store" })
            .then(async response => {
                const data = await response.json();
                if (!response.ok) throw new Error(data.error?.message ?? "Could not review updated version");
                if (active) setReview(data);
            }).catch(failure => { if (active) setError(failure instanceof Error ? failure.message : "Could not review updated version"); });
        return () => { active = false; };
    }, [props.contentId, props.mode]);

    async function submit() {
        setBusy(true);
        setError("");
        try {
            const creating = props.mode === "create";
            if (!creating && !review) return;
            const url = creating ? `/api/admin/content/${props.contentId}/version` : `/api/admin/content/${review!.source.id}/replacement`;
            const body = creating ? { sourceUpdatedAt: props.updatedAt } : {
                replacementId: review!.replacement.id, sourceUpdatedAt: review!.source.updated_at,
                replacementUpdatedAt: review!.replacement.updated_at,
            };
            const response = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
            const data = await response.json();
            if (!response.ok) throw new Error(data.error?.message ?? "Could not publish updated version");
            router.push(creating ? `/admin/content/${data.draftId}/edit` : "/admin/content");
            router.refresh();
        } catch (failure) {
            setError(failure instanceof Error ? failure.message : "Updated version failed");
        } finally { setBusy(false); }
    }

    return <section className="space-y-3 rounded-xl border border-zinc-200 bg-white p-5" aria-label="Updated version">
        <h2 className="font-semibold text-zinc-900">{props.mode === "create" ? "Rewriting this summary?" : "Review updated version"}</h2>
        <p className="text-sm text-zinc-600">{props.mode === "create"
            ? "Start a separate draft from the saved summary, or resume its existing draft. Unsaved changes on this page are not copied. The original stays published while you rewrite."
            : "Publish the saved draft and replace the original together. Old links will show the existing replacement notice. Original highlights, notes and reading history stay on the original version."}</p>
        {props.mode === "publish" && !review && !error && <p role="status" className="text-sm text-zinc-600">Loading review…</p>}
        {review && <div className="space-y-2 text-sm text-zinc-700">
            <p>Replace “{review.source.title}” with “{review.replacement.title}”.</p>
            <p>Preserve {review.preserved.libraryRecords} library records, {review.preserved.highlights} highlights and {review.preserved.reflections} reflections.</p>
            <p>Reading and listening positions stay separate. The updated version takes the original’s series position, if any.</p>
        </div>}
        {error && <p role="alert" className="text-sm text-red-700">{error}{props.mode === "publish" ? " Save and review again before retrying." : ""}</p>}
        <button type="button" onClick={() => void submit()} disabled={busy || (props.mode === "publish" && (!review || Boolean(error)))}
            className="rounded-lg bg-zinc-900 px-4 py-2 text-sm text-white disabled:opacity-50">
            {busy ? "Working…" : props.mode === "create" ? "Create updated version" : "Publish updated version"}
        </button>
    </section>;
}
