"use client";

import { useEffect, useRef, useCallback } from "react";

/**
 * Segment Observer Hook
 * 
 * Uses IntersectionObserver to track which segment is currently in view.
 * Debounces updates to avoid excessive state changes.
 */

interface UseSegmentObserverOptions {
    threshold?: number;
    debounceMs?: number;
    onSegmentChange?: (segmentId: string) => void;
}

export function useSegmentObserver({
    threshold = 0.6,
    debounceMs = 2000,
    onSegmentChange,
}: UseSegmentObserverOptions = {}) {
    const observerRef = useRef<IntersectionObserver | null>(null);
    const currentSegmentRef = useRef<string | null>(null);
    const debounceTimerRef = useRef<NodeJS.Timeout | null>(null);

    const handleIntersection = useCallback(
        (entries: IntersectionObserverEntry[]) => {
            // Find the most visible segment
            const visibleSegments = entries
                .filter((entry) => entry.isIntersecting)
                .sort((a, b) => b.intersectionRatio - a.intersectionRatio);

            if (visibleSegments.length === 0) return;

            const mostVisible = visibleSegments[0];
            const segmentId = mostVisible.target.getAttribute("data-segment-id");

            if (!segmentId || segmentId === currentSegmentRef.current) return;

            // Clear existing debounce timer
            if (debounceTimerRef.current) {
                clearTimeout(debounceTimerRef.current);
            }

            // Debounce the segment change
            debounceTimerRef.current = setTimeout(() => {
                currentSegmentRef.current = segmentId;
                onSegmentChange?.(segmentId);
            }, debounceMs);
        },
        [debounceMs, onSegmentChange]
    );

    const observe = useCallback(
        (element: Element) => {
            if (!observerRef.current) {
                observerRef.current = new IntersectionObserver(handleIntersection, {
                    threshold,
                    rootMargin: "-10% 0px -10% 0px",
                });
            }
            observerRef.current.observe(element);
        },
        [handleIntersection, threshold]
    );

    const unobserve = useCallback((element: Element) => {
        observerRef.current?.unobserve(element);
    }, []);

    useEffect(() => {
        return () => {
            observerRef.current?.disconnect();
            if (debounceTimerRef.current) {
                clearTimeout(debounceTimerRef.current);
            }
        };
    }, []);

    return { observe, unobserve };
}
