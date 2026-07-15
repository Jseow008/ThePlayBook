"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Check, Copy, Instagram, Loader2, Send, Share2 } from "lucide-react";
import { toast } from "sonner";
import { captureAnalyticsEvent } from "@/lib/analytics";
import { useMediaQuery } from "@/hooks/useMediaQuery";
import { useOverlayInteractions } from "@/hooks/useOverlayInteractions";
import { sharePreparedImage, usePreparedShareImage } from "@/hooks/usePreparedShareImage";
import { VIEWPORT_QUERIES } from "@/lib/breakpoints";
import { OVERLAY_LAYER_CLASS } from "@/lib/overlay-layers";
import { cn } from "@/lib/utils";

interface ContentShareMenuProps {
    contentId?: string;
    url?: string;
    path?: string;
    title: string;
    text?: string;
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

export function ContentShareMenu({
    contentId,
    url,
    path,
    title,
    text,
    className,
    source = "share_menu",
    contentType,
}: ContentShareMenuProps) {
    const [isOpen, setIsOpen] = useState(false);
    const [isBusy, setIsBusy] = useState(false);
    const [completedAction, setCompletedAction] = useState<"link" | "copy" | "story" | null>(null);
    const [mounted, setMounted] = useState(false);
    const menuRef = useRef<HTMLDivElement>(null);
    const panelRef = useRef<HTMLDivElement>(null);
    const triggerButtonRef = useRef<HTMLButtonElement>(null);
    const isCompactShareMenu = useMediaQuery(VIEWPORT_QUERIES.compactShareMenu);
    const resolvedUrl = buildResolvedUrl(url, path);
    const {
        status: imagePreparationStatus,
        prepare: prepareShareImage,
        getPreparedImage,
    } = usePreparedShareImage(contentId, title);

    useEffect(() => {
        setMounted(true);
    }, []);

    useOverlayInteractions({
        enabled: isOpen && mounted,
        containerRef: panelRef,
        restoreFocusRef: triggerButtonRef,
        onEscape: () => setIsOpen(false),
        scrollLock: isCompactShareMenu,
    });

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent | TouchEvent) => {
            const target = event.target as Node;
            const insideTrigger = menuRef.current?.contains(target);
            const insidePanel = panelRef.current?.contains(target);

            if (!insideTrigger && !insidePanel) {
                setIsOpen(false);
            }
        };

        if (isOpen) {
            document.addEventListener("mousedown", handleClickOutside);
            document.addEventListener("touchstart", handleClickOutside);
        }

        return () => {
            document.removeEventListener("mousedown", handleClickOutside);
            document.removeEventListener("touchstart", handleClickOutside);
        };
    }, [isOpen]);

    useEffect(() => {
        if (isOpen && contentId && imagePreparationStatus === "idle") {
            void prepareShareImage();
        }
    }, [contentId, imagePreparationStatus, isOpen, prepareShareImage]);

    function markCompleted(action: "link" | "copy" | "story") {
        setCompletedAction(action);
        window.setTimeout(() => setCompletedAction(null), 2000);
    }

    async function handleSendLink() {
        const shareData = { title, text: text ?? title, url: resolvedUrl };

        if (navigator.share && navigator.canShare?.(shareData)) {
            try {
                await navigator.share(shareData);
                captureAnalyticsEvent("share_clicked", {
                    source,
                    content_id: contentId,
                    content_type: contentType,
                    share_method: "native",
                    share_target: "content_link",
                });
                setIsOpen(false);
                markCompleted("link");
                return;
            } catch (err) {
                if ((err as Error).name === "AbortError") return;
            }
        }

        await handleCopyLink();
    }

    async function handleCopyLink() {
        try {
            await navigator.clipboard.writeText(resolvedUrl);
            captureAnalyticsEvent("share_clicked", {
                source,
                content_id: contentId,
                content_type: contentType,
                share_method: "copy_link",
                share_target: "content_link",
            });
            toast.success("Link copied to clipboard");
            setIsOpen(false);
            markCompleted("copy");
        } catch {
            toast.error("Could not copy link");
        }
    }

    async function handleShareImage() {
        if (!contentId || isBusy) return;

        const preparedImage = getPreparedImage();
        if (!preparedImage) return;

        let didComplete = false;
        setIsBusy(true);

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
                    ? result.copiedLink ? "Image shared. Link copied." : "Image shared."
                    : result.copiedLink ? "Image downloaded. Link copied." : "Image downloaded."
            );
            didComplete = true;
            setIsOpen(false);
        } finally {
            setIsBusy(false);
            if (didComplete) {
                markCompleted("story");
            }
        }
    }

    const menuItems = (
        <div className="space-y-1">
            <button
                type="button"
                role="menuitem"
                onClick={handleSendLink}
                className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm text-muted-foreground transition-colors hover:bg-secondary/70 hover:text-foreground focus:bg-secondary/70 focus:text-foreground focus:outline-none"
            >
                <Send className="size-4 shrink-0" />
                <span className="font-medium">Send link</span>
                {completedAction === "link" && <Check className="ml-auto size-4 text-primary" />}
            </button>
            <button
                type="button"
                role="menuitem"
                onClick={handleCopyLink}
                className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm text-muted-foreground transition-colors hover:bg-secondary/70 hover:text-foreground focus:bg-secondary/70 focus:text-foreground focus:outline-none"
            >
                <Copy className="size-4 shrink-0" />
                <span className="font-medium">Copy link</span>
                {completedAction === "copy" && <Check className="ml-auto size-4 text-primary" />}
            </button>
            {contentId && (
                <button
                    type="button"
                    role="menuitem"
                    onClick={imagePreparationStatus === "failed" ? () => void prepareShareImage() : handleShareImage}
                    disabled={isBusy || imagePreparationStatus === "idle" || imagePreparationStatus === "preparing"}
                    className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm text-muted-foreground transition-colors hover:bg-secondary/70 hover:text-foreground focus:bg-secondary/70 focus:text-foreground focus:outline-none disabled:cursor-wait disabled:opacity-70"
                >
                    {isBusy || imagePreparationStatus === "idle" || imagePreparationStatus === "preparing" ? (
                        <Loader2 className="size-4 shrink-0 animate-spin" />
                    ) : (
                        <Instagram className="size-4 shrink-0" />
                    )}
                    <span className="font-medium">
                        {imagePreparationStatus === "failed"
                            ? "Try again"
                            : isBusy || imagePreparationStatus === "idle" || imagePreparationStatus === "preparing"
                                ? "Preparing image..."
                                : "Share image"}
                    </span>
                    {completedAction === "story" && <Check className="ml-auto size-4 text-primary" />}
                </button>
            )}
        </div>
    );

    return (
        <div className="relative" ref={menuRef}>
            <button
                ref={triggerButtonRef}
                type="button"
                onClick={() => setIsOpen((value) => !value)}
                className={cn(
                    "inline-flex items-center justify-center rounded-full transition-colors",
                    isOpen && "bg-secondary/60 text-foreground ring-2 ring-ring",
                    className
                )}
                title="Share"
                aria-label="Share this content"
                aria-haspopup="menu"
                aria-expanded={isOpen}
            >
                {completedAction ? (
                    <Check className="size-4 text-primary" />
                ) : (
                    <Share2 className="size-4" />
                )}
            </button>

            {isOpen && mounted && (
                isCompactShareMenu ? createPortal(
                    <>
                        <div
                            className={cn(
                                "fixed inset-0 bg-background/80 backdrop-blur-sm animate-in fade-in motion-reduce:animate-none",
                                OVERLAY_LAYER_CLASS.popover
                            )}
                            onClick={() => setIsOpen(false)}
                        />
                        <div
                            ref={panelRef}
                            role="menu"
                            aria-label="Share"
                            tabIndex={-1}
                            className={cn(
                                "fixed inset-x-0 bottom-0 w-full rounded-t-2xl border-t border-border bg-card px-3 pb-[calc(3.75rem+var(--safe-area-bottom))] pt-3 shadow-[0_-8px_30px_rgb(0,0,0,0.12)] animate-in slide-in-from-bottom-full duration-300 motion-reduce:animate-none motion-reduce:transition-none",
                                OVERLAY_LAYER_CLASS.sheetRaised
                            )}
                        >
                            {menuItems}
                        </div>
                    </>,
                    document.body
                ) : (
                    <div
                        ref={panelRef}
                        role="menu"
                        aria-label="Share"
                        tabIndex={-1}
                        className={cn(
                            "absolute right-0 mt-2 w-52 rounded-xl border border-border bg-card p-1.5 shadow-2xl animate-fade-in origin-top-right",
                            OVERLAY_LAYER_CLASS.drawer
                        )}
                    >
                        {menuItems}
                    </div>
                )
            )}
        </div>
    );
}
