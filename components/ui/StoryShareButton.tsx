"use client";

import { useEffect, useState } from "react";
import { Check, Instagram, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { captureAnalyticsEvent } from "@/lib/analytics";
import { sharePreparedImage, usePreparedShareImage } from "@/hooks/usePreparedShareImage";
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
    const {
        status: imagePreparationStatus,
        prepare: prepareShareImage,
        getPreparedImage,
    } = usePreparedShareImage(contentId, title);

    useEffect(() => {
        void prepareShareImage();
    }, [prepareShareImage]);

    const handleStoryShare = async () => {
        if (isSharing) return;

        if (imagePreparationStatus === "failed") {
            void prepareShareImage();
            return;
        }

        const preparedImage = getPreparedImage();
        if (!preparedImage) return;

        const resolvedUrl = buildResolvedUrl(url, path);
        let didComplete = false;
        setIsSharing(true);

        try {
            const result = await sharePreparedImage(preparedImage, resolvedUrl);

            if (result.status === "cancelled") return;

            if (result.status === "failed") {
                toast.error("Could not open the share sheet");
                return;
            }

            captureAnalyticsEvent("share_clicked", {
                source,
                content_id: contentId,
                content_type: contentType,
                share_method: result.status === "shared" ? "native" : "download",
                share_target: "story_image",
            });
            toast.success(
                result.status === "shared"
                    ? result.copiedLink ? "Story image shared. Link copied for the sticker." : "Story image shared."
                    : result.copiedLink ? "Story image downloaded. Link copied for the sticker." : "Story image downloaded."
            );
            didComplete = true;
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
            disabled={isSharing || imagePreparationStatus === "idle" || imagePreparationStatus === "preparing"}
            className={cn(
                "inline-flex items-center justify-center rounded-full transition-colors disabled:cursor-wait disabled:opacity-70",
                className
            )}
            title="Share story image"
            aria-label="Share story image"
        >
            {completed ? (
                <Check className="size-4 text-primary" />
            ) : imagePreparationStatus === "idle" || imagePreparationStatus === "preparing" ? (
                <Loader2 className="size-4 animate-spin" />
            ) : (
                <Instagram className="size-4" />
            )}
        </button>
    );
}
