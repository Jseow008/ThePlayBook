"use client";

import { useState } from "react";
import { Copy, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { buildSavedHighlightCopy } from "@/lib/saved-highlight-copy";

type SavedNoteCopyButtonProps = {
    item: Parameters<typeof buildSavedHighlightCopy>[0];
    passageHref: string | null;
};

export function SavedNoteCopyButton({ item, passageHref }: SavedNoteCopyButtonProps) {
    const [isCopying, setIsCopying] = useState(false);

    const copy = async () => {
        setIsCopying(true);
        try {
            if (!navigator.clipboard?.writeText) {
                toast.error("Clipboard access is unavailable in this browser.");
                return;
            }
            const text = buildSavedHighlightCopy(item, passageHref, window.location.origin);
            await navigator.clipboard.writeText(text);
            toast.success("Copied");
        } catch {
            toast.error("Could not copy. Check clipboard access and try again.");
        } finally {
            setIsCopying(false);
        }
    };

    return (
        <button
            type="button"
            onClick={copy}
            disabled={isCopying}
            aria-busy={isCopying}
            aria-label="Copy with source"
            title="Copy saved quotation, note and source"
            className="inline-flex size-9 items-center justify-center rounded-md p-2 text-muted-foreground/80 transition-colors hover:bg-background/40 hover:text-foreground focus:outline-none focus:ring-2 focus:ring-primary disabled:cursor-wait disabled:opacity-60"
        >
            {isCopying ? <Loader2 aria-hidden="true" className="size-4 animate-spin" /> : <Copy aria-hidden="true" className="size-4" />}
        </button>
    );
}
