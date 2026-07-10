"use client";

import { useState } from "react";
import { Check, Instagram } from "lucide-react";
import { toast } from "sonner";
import { captureAnalyticsEvent } from "@/lib/analytics";
import { cn } from "@/lib/utils";

interface StoryShareButtonProps {
    contentId: string;
    title: string;
    url?: string;
    path?: string;
    className?: string;
    source?: string;
    contentType?: string;
}

function buildResolvedUrl(url?: string, path?: string) {
    if (url) return url;
    if (path && typeof window !== "undefined") {
        return new URL(path, window.location.origin).toString();
    }

    return path ?? "";
}

function buildStoryImageUrl(contentId: string) {
    return new URL(`/api/og/content/${contentId}/story`, window.location.origin).toString();
}

function buildStoryFileName(title: string) {
    const slug = title
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "")
        .slice(0, 48);

    return `${slug || "netflux-read"}-story.png`;
}

async function copyShareLink(url: string) {
    if (!url || !navigator.clipboard) return false;

    try {
        await navigator.clipboard.writeText(url);
        return true;
    } catch {
        return false;
    }
}

function canShareFiles(files: File[]) {
    try {
        return typeof navigator.share === "function"
            && typeof navigator.canShare === "function"
            && navigator.canShare({ files });
    } catch {
        return false;
    }
}

function downloadBlob(blob: Blob, fileName: string) {
    const objectUrl = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = objectUrl;
    link.download = fileName;
    link.rel = "noopener";
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(objectUrl), 30_000);
}

export function StoryShareButton({
    contentId,
    title,
    url,
    path,
    className,
    source = "story_share_button",
    contentType,
}: StoryShareButtonProps) {
    const [isSharing, setIsSharing] = useState(false);
    const [completed, setCompleted] = useState(false);

    const handleStoryShare = async () => {
        if (isSharing) return;

        const resolvedUrl = buildResolvedUrl(url, path);
        const imageUrl = buildStoryImageUrl(contentId);
        const fileName = buildStoryFileName(title);
        let didComplete = false;
        setIsSharing(true);

        try {
            const response = await fetch(imageUrl, {
                headers: { Accept: "image/png" },
            });

            if (!response.ok) {
                throw new Error(`Story image request failed with ${response.status}`);
            }

            const blob = await response.blob();
            const file = new File([blob], fileName, {
                type: blob.type || "image/png",
                lastModified: Date.now(),
            });
            const copiedLink = await copyShareLink(resolvedUrl);
            const shareData: ShareData = { files: [file] };

            if (canShareFiles([file])) {
                try {
                    await navigator.share(shareData);
                    captureAnalyticsEvent("share_clicked", {
                        source,
                        content_id: contentId,
                        content_type: contentType,
                        share_method: "native",
                        share_target: "story_image",
                    });
                    if (copiedLink) toast.success("Story image shared. Link copied for the sticker.");
                    didComplete = true;
                    return;
                } catch (err) {
                    if ((err as Error).name === "AbortError") return;
                }
            }

            downloadBlob(blob, fileName);
            captureAnalyticsEvent("share_clicked", {
                source,
                content_id: contentId,
                content_type: contentType,
                share_method: "download",
                share_target: "story_image",
            });
            toast.success(
                copiedLink
                    ? "Story image downloaded. Link copied for the sticker."
                    : "Story image downloaded."
            );
            didComplete = true;
        } catch {
            toast.error("Could not prepare the story image");
        } finally {
            setIsSharing(false);
            if (didComplete) {
                setCompleted(true);
                window.setTimeout(() => setCompleted(false), 2000);
            }
        }
    };

    return (
        <button
            type="button"
            onClick={handleStoryShare}
            disabled={isSharing}
            className={cn(
                "inline-flex items-center justify-center rounded-full transition-colors disabled:cursor-wait disabled:opacity-70",
                className
            )}
            title="Share story image"
            aria-label="Share story image"
        >
            {completed ? (
                <Check className="size-4 text-primary" />
            ) : (
                <Instagram className="size-4" />
            )}
        </button>
    );
}
