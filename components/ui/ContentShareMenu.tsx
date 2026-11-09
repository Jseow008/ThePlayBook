"use client";

import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
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
    destination: "Preview" | "Read";
    themeClassName?: string;
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

function canSendLink(data: ShareData) {
    try {
        return typeof navigator.share === "function" && navigator.canShare?.(data) === true;
    } catch {
        return false;
    }
}

export function ContentShareMenu({
    contentId,
    url,
    path,
    title,
    destination,
    themeClassName,
    text,
    className,
    source = "share_menu",
    contentType,
}: ContentShareMenuProps) {
    const [isOpen, setIsOpen] = useState(false);
    const [isBusy, setIsBusy] = useState(false);
    const [completedAction, setCompletedAction] = useState<"link" | "copy" | "story" | null>(null);
    const [mounted, setMounted] = useState(false);
    const [position, setPosition] = useState({ top: 16, left: 16 });
    const destinationId = useId();
    const menuRef = useRef<HTMLDivElement>(null);
    const panelRef = useRef<HTMLDivElement>(null);
    const triggerButtonRef = useRef<HTMLButtonElement>(null);
    const isCompactReaderControls = useMediaQuery(VIEWPORT_QUERIES.compactReaderControls);
    const resolvedUrl = buildResolvedUrl(url, path);
    const shareData = { title, text: text ?? title, url: resolvedUrl };
    const showSendLink = isOpen && mounted && canSendLink(shareData);
    const imageContentId = destination === "Read" ? contentId : undefined;
    const {
        status: imagePreparationStatus,
        prepare: prepareShareImage,
        getPreparedImage,
    } = usePreparedShareImage(imageContentId, title);

    useEffect(() => {
        setMounted(true);
    }, []);

    useLayoutEffect(() => {
        if (!isOpen || !mounted || isCompactReaderControls) return;

        // Focus cards clip overflow. Anchor the portaled menu to the trigger.
        function placeMenu() {
            const trigger = triggerButtonRef.current?.getBoundingClientRect();
            const panel = panelRef.current?.getBoundingClientRect();
            if (!trigger || !panel) return;
            if (trigger.bottom < 0 || trigger.top > window.innerHeight) {
                setIsOpen(false);
                return;
            }

            const below = trigger.bottom + 8;
            const above = trigger.top - panel.height - 8;
            const maxTop = window.innerHeight - panel.height - 16;
            setPosition({
                top: Math.max(16, Math.min(below <= maxTop ? below : above, maxTop)),
                left: Math.max(16, Math.min(trigger.right - panel.width, window.innerWidth - panel.width - 16)),
            });
        }

        placeMenu();
        window.addEventListener("resize", placeMenu);
        window.addEventListener("scroll", placeMenu, true);
        return () => {
            window.removeEventListener("resize", placeMenu);
            window.removeEventListener("scroll", placeMenu, true);
        };
    }, [isOpen, mounted, isCompactReaderControls, showSendLink]);

    useOverlayInteractions({
        enabled: isOpen && mounted,
        containerRef: panelRef,
        restoreFocusRef: triggerButtonRef,
        onEscape: () => setIsOpen(false),
        scrollLock: isCompactReaderControls,
        preventInitialFocusScroll: true,
        preventRestoreFocusScroll: true,
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
        if (isOpen && imageContentId && imagePreparationStatus === "idle") {
            void prepareShareImage();
        }
    }, [imageContentId, imagePreparationStatus, isOpen, prepareShareImage]);

    function markCompleted(action: "link" | "copy" | "story") {
        setCompletedAction(action);
        window.setTimeout(() => setCompletedAction(null), 2000);
    }

    async function handleSendLink() {
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
        } catch (error) {
            if ((error as Error).name === "AbortError") return;
            toast.error("Could not send link");
        }
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
        if (!imageContentId || isBusy) return;

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

    const optionClass = "flex min-h-11 w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm text-muted-foreground transition-colors hover:bg-secondary/70 hover:text-foreground focus:bg-secondary/70 focus:text-foreground focus:outline-none sm:min-h-0";
    const menuItems = (
        <div className="space-y-1">
            <p id={destinationId} className="px-3 py-1 text-xs text-muted-foreground">
                Link opens {destination}
            </p>
            {showSendLink && (
                <button
                    type="button"
                    role="menuitem"
                    onClick={handleSendLink}
                    className={optionClass}
                >
                    <Send className="size-4 shrink-0" />
                    <span className="font-medium">Send link</span>
                    {completedAction === "link" && <Check className="ml-auto size-4 text-primary" />}
                </button>
            )}
            <button
                type="button"
                role="menuitem"
                onClick={handleCopyLink}
                className={optionClass}
            >
                <Copy className="size-4 shrink-0" />
                <span className="font-medium">Copy link</span>
                {completedAction === "copy" && <Check className="ml-auto size-4 text-primary" />}
            </button>
            {imageContentId && (
                <button
                    type="button"
                    role="menuitem"
                    onClick={imagePreparationStatus === "failed" ? () => void prepareShareImage() : handleShareImage}
                    disabled={isBusy || imagePreparationStatus === "idle" || imagePreparationStatus === "preparing"}
                    className={cn(optionClass, "disabled:cursor-wait disabled:opacity-70")}
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

            {isOpen && mounted && createPortal(
                <>
                    {isCompactReaderControls && (
                        <div
                            className={cn(
                                themeClassName,
                                "fixed inset-0 bg-background/80 backdrop-blur-sm animate-in fade-in motion-reduce:animate-none",
                                OVERLAY_LAYER_CLASS.popover
                            )}
                            onClick={() => setIsOpen(false)}
                        />
                    )}
                    <div
                        ref={panelRef}
                        role="menu"
                        aria-label="Share"
                        aria-describedby={destinationId}
                        tabIndex={-1}
                        style={isCompactReaderControls ? undefined : position}
                        className={cn(
                            themeClassName,
                            "fixed overflow-y-auto bg-card text-foreground",
                            isCompactReaderControls
                                ? "inset-x-0 bottom-0 max-h-[90dvh] w-full rounded-t-2xl border-t border-border px-3 pb-[calc(3.75rem+var(--safe-area-bottom))] pt-3 shadow-[0_-8px_30px_rgba(0,0,0,0.12)] animate-in slide-in-from-bottom-full duration-300 motion-reduce:animate-none motion-reduce:transition-none"
                                : "max-h-[calc(100dvh-2rem)] w-52 rounded-xl border border-border p-1.5 shadow-2xl animate-fade-in origin-top-right",
                            isCompactReaderControls ? OVERLAY_LAYER_CLASS.sheetRaised : OVERLAY_LAYER_CLASS.popover
                        )}
                    >
                        {menuItems}
                    </div>
                </>,
                document.body
            )}
        </div>
    );
}
