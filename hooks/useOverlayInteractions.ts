"use client";

import { useEffect, useRef, type RefObject } from "react";
import { useBodyScrollLock } from "@/hooks/useBodyScrollLock";

const FOCUSABLE_SELECTOR = [
    "a[href]",
    "button:not([disabled])",
    "textarea:not([disabled])",
    "input:not([disabled])",
    "select:not([disabled])",
    "[tabindex]:not([tabindex='-1'])",
    "[contenteditable='true']",
].join(",");

// Mutated only from client effects so nested overlays can route keyboard events.
const overlayStack: symbol[] = [];

function pushOverlay(token: symbol) {
    if (!overlayStack.includes(token)) {
        overlayStack.push(token);
    }
}

function removeOverlay(token: symbol) {
    const index = overlayStack.indexOf(token);
    if (index >= 0) {
        overlayStack.splice(index, 1);
    }
}

function isTopOverlay(token: symbol) {
    return overlayStack[overlayStack.length - 1] === token;
}

function isHTMLElement(value: Element | null): value is HTMLElement {
    return value instanceof HTMLElement;
}

export function getOverlayFocusableElements(container: HTMLElement | null) {
    if (!container) {
        return [];
    }

    return Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR))
        .filter((element) => {
            if (element.hasAttribute("disabled") || element.getAttribute("aria-hidden") === "true") {
                return false;
            }

            const style = window.getComputedStyle(element);
            return style.display !== "none" && style.visibility !== "hidden";
        });
}

interface OverlayScrollLockOptions {
    freezePosition?: boolean;
    lockDocumentElement?: boolean;
}

interface UseOverlayInteractionsOptions {
    enabled: boolean;
    containerRef: RefObject<HTMLElement | null>;
    onEscape?: () => void;
    initialFocusRef?: RefObject<HTMLElement | null>;
    restoreFocusRef?: RefObject<HTMLElement | null>;
    trapFocus?: boolean;
    restoreFocus?: boolean;
    isolateBackground?: boolean;
    scrollLock?: boolean | OverlayScrollLockOptions;
}

export function useOverlayInteractions({
    enabled,
    containerRef,
    onEscape,
    initialFocusRef,
    restoreFocusRef,
    trapFocus = true,
    restoreFocus = true,
    isolateBackground = false,
    scrollLock = false,
}: UseOverlayInteractionsOptions) {
    const tokenRef = useRef(Symbol("overlay-interactions"));
    const previousActiveElementRef = useRef<HTMLElement | null>(null);
    const onEscapeRef = useRef(onEscape);

    onEscapeRef.current = onEscape;

    const shouldLockScroll = Boolean(scrollLock);
    const freezePosition = typeof scrollLock === "object"
        ? scrollLock.freezePosition ?? false
        : false;
    const lockDocumentElement = typeof scrollLock === "object"
        ? scrollLock.lockDocumentElement ?? false
        : false;
    useBodyScrollLock(enabled && shouldLockScroll, { freezePosition, lockDocumentElement });

    useEffect(() => {
        if (!enabled || !isolateBackground) {
            return;
        }

        const container = containerRef.current;
        if (!container) {
            return;
        }

        const backgroundElements = Array.from(document.body.children)
            .filter((element): element is HTMLElement =>
                element instanceof HTMLElement
                && element !== container
                && !element.contains(container)
            )
            .map((element) => ({
                element,
                ariaHidden: element.getAttribute("aria-hidden"),
                inert: element.inert,
                pointerEvents: element.style.pointerEvents,
            }));

        for (const { element } of backgroundElements) {
            element.inert = true;
            element.setAttribute("aria-hidden", "true");
            element.style.pointerEvents = "none";
        }

        return () => {
            for (const { element, ariaHidden, inert, pointerEvents } of backgroundElements) {
                element.inert = inert;
                element.style.pointerEvents = pointerEvents;

                if (ariaHidden === null) {
                    element.removeAttribute("aria-hidden");
                } else {
                    element.setAttribute("aria-hidden", ariaHidden);
                }
            }
        };
    }, [containerRef, enabled, isolateBackground]);

    useEffect(() => {
        const token = tokenRef.current;

        if (!enabled) {
            removeOverlay(token);
            return;
        }

        pushOverlay(token);
        const activeElement = document.activeElement;
        previousActiveElementRef.current = isHTMLElement(activeElement) ? activeElement : null;
        const restoreFocusElement = restoreFocusRef?.current ?? null;

        const focusFrame = window.requestAnimationFrame(() => {
            if (!isTopOverlay(token)) {
                return;
            }

            const container = containerRef.current;
            const focusTarget =
                initialFocusRef?.current
                ?? getOverlayFocusableElements(container)[0]
                ?? container;

            focusTarget?.focus();
        });

        return () => {
            window.cancelAnimationFrame(focusFrame);
            removeOverlay(token);

            if (!restoreFocus) {
                return;
            }

            const restoreTarget = restoreFocusElement ?? previousActiveElementRef.current;
            if (restoreTarget?.isConnected) {
                window.requestAnimationFrame(() => restoreTarget.focus());
            }
        };
    }, [containerRef, enabled, initialFocusRef, restoreFocus, restoreFocusRef]);

    useEffect(() => {
        if (!enabled) {
            return;
        }

        const token = tokenRef.current;

        const handleKeyDown = (event: KeyboardEvent) => {
            if (!isTopOverlay(token)) {
                return;
            }

            if (event.key === "Escape" && onEscapeRef.current) {
                event.preventDefault();
                onEscapeRef.current();
                return;
            }

            if (!trapFocus || event.key !== "Tab") {
                return;
            }

            const container = containerRef.current;
            const focusableElements = getOverlayFocusableElements(container);

            if (focusableElements.length === 0) {
                event.preventDefault();
                container?.focus();
                return;
            }

            const first = focusableElements[0];
            const last = focusableElements[focusableElements.length - 1];
            const activeElement = document.activeElement;

            if (!activeElement || !container?.contains(activeElement)) {
                event.preventDefault();
                (event.shiftKey ? last : first)?.focus();
                return;
            }

            if (event.shiftKey && activeElement === first) {
                event.preventDefault();
                last?.focus();
                return;
            }

            if (!event.shiftKey && activeElement === last) {
                event.preventDefault();
                first?.focus();
            }
        };

        document.addEventListener("keydown", handleKeyDown);
        return () => document.removeEventListener("keydown", handleKeyDown);
    }, [containerRef, enabled, trapFocus]);
}
