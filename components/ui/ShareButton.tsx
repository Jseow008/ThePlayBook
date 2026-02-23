"use client";

import { useState } from "react";
import { Share2, Check, Link } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

interface ShareButtonProps {
    url: string;
    title: string;
    text?: string;
    className?: string;
    variant?: "icon" | "pill";
}

/**
 * ShareButton — Web Share API with clipboard fallback.
 *
 * On mobile: triggers the native OS share sheet.
 * On desktop (or unsupported): copies the URL to clipboard and shows a toast.
 */
export function ShareButton({
    url,
    title,
    text,
    className,
    variant = "pill",
}: ShareButtonProps) {
    const [copied, setCopied] = useState(false);

    const handleShare = async () => {
        const shareData = { title, text: text ?? title, url };

        // Try native Web Share API first (mobile-first)
        if (navigator.share && navigator.canShare?.(shareData)) {
            try {
                await navigator.share(shareData);
                return;
            } catch (err) {
                // User cancelled or share failed — fall through to clipboard
                if ((err as Error).name === "AbortError") return;
            }
        }

        // Fallback: copy to clipboard
        try {
            await navigator.clipboard.writeText(url);
            setCopied(true);
            toast.success("Link copied to clipboard");
            setTimeout(() => setCopied(false), 2000);
        } catch {
            toast.error("Could not copy link");
        }
    };

    if (variant === "icon") {
        return (
            <button
                onClick={handleShare}
                className={cn(
                    "inline-flex items-center justify-center p-2 rounded-full transition-colors",
                    "text-muted-foreground hover:text-foreground hover:bg-secondary/60",
                    className
                )}
                title="Share"
                aria-label="Share this content"
            >
                {copied ? (
                    <Check className="size-4 text-primary" />
                ) : (
                    <Share2 className="size-4" />
                )}
            </button>
        );
    }

    return (
        <button
            onClick={handleShare}
            className={cn(
                "inline-flex items-center gap-2 h-9 px-4 rounded-full text-sm font-medium transition-all",
                "border border-border/70 bg-secondary/30 text-muted-foreground",
                "hover:bg-secondary/60 hover:text-foreground hover:border-border",
                "active:scale-95",
                className
            )}
            aria-label="Share this content"
        >
            {copied ? (
                <>
                    <Check className="size-4 text-primary" />
                    <span className="text-primary">Copied!</span>
                </>
            ) : (
                <>
                    <Link className="size-4" />
                    Share
                </>
            )}
        </button>
    );
}
