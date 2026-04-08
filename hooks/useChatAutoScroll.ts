"use client";

import { useCallback, useEffect, useRef, useState } from "react";

const DEFAULT_SCROLL_THRESHOLD = 24;

interface UseChatAutoScrollOptions {
    messageCount: number;
    lastMessageId?: string;
    lastMessageTextLength: number;
    status: string;
    enabled?: boolean;
    threshold?: number;
}

function scrollContainerToBottom(container: HTMLElement, behavior: ScrollBehavior) {
    if (typeof container.scrollTo === "function") {
        container.scrollTo({ top: container.scrollHeight, behavior });
        return;
    }

    container.scrollTop = container.scrollHeight;
}

export function useChatAutoScroll<T extends HTMLElement>({
    messageCount,
    lastMessageId,
    lastMessageTextLength,
    status,
    enabled = true,
    threshold = DEFAULT_SCROLL_THRESHOLD,
}: UseChatAutoScrollOptions) {
    const [containerElement, setContainerElement] = useState<T | null>(null);
    const containerElementRef = useRef<T | null>(null);
    const containerRef = useCallback((node: T | null) => {
        if (containerElementRef.current === node) {
            return;
        }

        containerElementRef.current = node;
        setContainerElement(node);
    }, []);
    const endRef = useRef<HTMLDivElement>(null);
    const hasMountedRef = useRef(false);
    const shouldStickToBottomRef = useRef(true);
    const isAutoScrollingRef = useRef(false);
    const isInteractingRef = useRef(false);
    const isManuallyPausedRef = useRef(false);
    const lastKnownScrollTopRef = useRef(0);
    const touchMovedRef = useRef(false);
    const lastTouchYRef = useRef<number | null>(null);
    const previousMessageCountRef = useRef(0);
    const previousStatusRef = useRef<string | null>(null);
    const previousLastMessageIdRef = useRef<string | undefined>(undefined);
    const previousLastMessageTextLengthRef = useRef(0);

    useEffect(() => {
        const container = containerElement;
        if (!container) {
            return;
        }

        const updateStickiness = () => {
            const currentScrollTop = container.scrollTop;
            const distanceFromBottom = container.scrollHeight - container.clientHeight - container.scrollTop;
            const isScrollingUp = currentScrollTop < lastKnownScrollTopRef.current - 1;
            const isScrollingDown = currentScrollTop > lastKnownScrollTopRef.current + 1;

            if (isAutoScrollingRef.current) {
                isAutoScrollingRef.current = false;
                lastKnownScrollTopRef.current = currentScrollTop;
                return;
            }

            if (isManuallyPausedRef.current) {
                if (!isInteractingRef.current && isScrollingDown && distanceFromBottom <= threshold) {
                    isManuallyPausedRef.current = false;
                    shouldStickToBottomRef.current = true;
                } else {
                    shouldStickToBottomRef.current = false;
                }

                lastKnownScrollTopRef.current = currentScrollTop;
                return;
            }

            if (isScrollingUp || (currentScrollTop > 0 && distanceFromBottom > threshold)) {
                shouldStickToBottomRef.current = false;
            } else if (distanceFromBottom <= threshold) {
                shouldStickToBottomRef.current = true;
            }

            lastKnownScrollTopRef.current = currentScrollTop;
        };

        const handleWheel = (event: WheelEvent) => {
            if (event.deltaY < 0) {
                isManuallyPausedRef.current = true;
                shouldStickToBottomRef.current = false;
            }
        };

        const handlePointerDown = () => {
            isInteractingRef.current = true;
        };

        const handlePointerUp = () => {
            isInteractingRef.current = false;
            updateStickiness();
        };

        const handleTouchStart = (event: TouchEvent) => {
            isInteractingRef.current = true;
            touchMovedRef.current = false;
            shouldStickToBottomRef.current = false;
            lastTouchYRef.current = event.touches[0]?.clientY ?? null;
        };

        const handleTouchMove = (event: TouchEvent) => {
            const currentTouchY = event.touches[0]?.clientY;
            if (currentTouchY === undefined || lastTouchYRef.current === null) {
                return;
            }

            if (Math.abs(currentTouchY - lastTouchYRef.current) > 2) {
                touchMovedRef.current = true;
                isManuallyPausedRef.current = true;
                shouldStickToBottomRef.current = false;
            }

            lastTouchYRef.current = currentTouchY;
        };

        const handleTouchEnd = () => {
            isInteractingRef.current = false;
            lastTouchYRef.current = null;
            if (!touchMovedRef.current) {
                shouldStickToBottomRef.current = true;
            }
            updateStickiness();
        };

        updateStickiness();
        container.addEventListener("scroll", updateStickiness, { passive: true });
        container.addEventListener("wheel", handleWheel, { passive: true });
        container.addEventListener("pointerdown", handlePointerDown, { passive: true });
        container.addEventListener("pointerup", handlePointerUp, { passive: true });
        container.addEventListener("pointercancel", handlePointerUp, { passive: true });
        container.addEventListener("touchstart", handleTouchStart, { passive: true });
        container.addEventListener("touchmove", handleTouchMove, { passive: true });
        container.addEventListener("touchend", handleTouchEnd, { passive: true });
        container.addEventListener("touchcancel", handleTouchEnd, { passive: true });

        const detachListeners = () => {
            container.removeEventListener("scroll", updateStickiness);
            container.removeEventListener("wheel", handleWheel);
            container.removeEventListener("pointerdown", handlePointerDown);
            container.removeEventListener("pointerup", handlePointerUp);
            container.removeEventListener("pointercancel", handlePointerUp);
            container.removeEventListener("touchstart", handleTouchStart);
            container.removeEventListener("touchmove", handleTouchMove);
            container.removeEventListener("touchend", handleTouchEnd);
            container.removeEventListener("touchcancel", handleTouchEnd);
        };

        return detachListeners;
    }, [containerElement, threshold]);

    useEffect(() => {
        const previousMessageCount = previousMessageCountRef.current;
        const previousStatus = previousStatusRef.current;
        const previousLastMessageId = previousLastMessageIdRef.current;
        const previousLastMessageTextLength = previousLastMessageTextLengthRef.current;

        const hasMessages = messageCount > 0;
        const hasNewMessage =
            messageCount > previousMessageCount
            || (lastMessageId !== undefined && lastMessageId !== previousLastMessageId);
        const startedStreaming =
            hasMessages
            && status === "streaming"
            && previousStatus !== "streaming";
        const lastMessageGrew =
            hasMessages
            && status === "streaming"
            && lastMessageId === previousLastMessageId
            && lastMessageTextLength > previousLastMessageTextLength;

        if (enabled && hasMountedRef.current && !isInteractingRef.current && shouldStickToBottomRef.current && (hasNewMessage || startedStreaming || lastMessageGrew)) {
            const container = containerElementRef.current;
            if (container) {
                isAutoScrollingRef.current = true;
                scrollContainerToBottom(container, "auto");
                lastKnownScrollTopRef.current = container.scrollTop;
            }
        }

        hasMountedRef.current = true;
        previousMessageCountRef.current = messageCount;
        previousStatusRef.current = status;
        previousLastMessageIdRef.current = lastMessageId;
        previousLastMessageTextLengthRef.current = lastMessageTextLength;
    }, [enabled, lastMessageId, lastMessageTextLength, messageCount, status]);

    const scrollToBottom = (behavior: ScrollBehavior = "auto") => {
        const container = containerElementRef.current;
        isManuallyPausedRef.current = false;
        shouldStickToBottomRef.current = true;
        if (!container) {
            return;
        }

        isAutoScrollingRef.current = true;
        scrollContainerToBottom(container, behavior);
        lastKnownScrollTopRef.current = container.scrollTop;
    };

    return {
        containerRef,
        endRef,
        scrollToBottom,
    };
}
