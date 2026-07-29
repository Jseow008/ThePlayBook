"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { ArrowLeft, ArrowRight, MessageCircleQuestion, List } from "lucide-react";
import { toast } from "sonner";
import { ReaderHeroHeader } from "./ReaderHeroHeader";
import { SegmentAccordion } from "./SegmentAccordion";
import type { ContentItemWithSegments, QuickMode } from "@/types/domain";
import { useReadingProgress, type ReadingProgressData } from "@/hooks/useReadingProgress";
import { useReadingTimer } from "@/hooks/useReadingTimer";
import { useReaderSettings } from "@/hooks/useReaderSettings";
import { ContentFeedback } from "@/components/ui/ContentFeedback";
import { CompletionCard } from "./CompletionCard";
import { TextSelectionToolbar } from "./TextSelectionToolbar";
import { NotesDrawer } from "./NotesDrawer";
import { useHighlights } from "@/hooks/useHighlights";
import { useMediaQuery } from "@/hooks/useMediaQuery";
import { VIEWPORT_QUERIES } from "@/lib/breakpoints";
import { buildCanonicalReadPath } from "@/lib/content-paths";
import { HighlightPopover } from "./HighlightPopover";
import { MobileSelectionActions } from "./MobileSelectionActions";
import { findCompletedSegmentIdsForPlaybackTime, findSegmentIdForPlaybackTime } from "@/lib/reader-audio-sync";
import { captureAnalyticsEvent } from "@/lib/analytics";
import { cn } from "@/lib/utils";
import {
    clearScopedAudioResume,
    getStorageScope,
    migrateScopedAudioResume,
    readScopedAudioResume,
    writeScopedAudioResume,
} from "@/lib/local-user-storage";
import { OVERLAY_LAYER_CLASS } from "@/lib/overlay-layers";

/**
 * Reader View — Accordion Layout
 *
 * Single-column layout replacing the old 3-column sidebar + content + actions.
 * All segments are shown as an accordion list. Users expand one at a time.
 * Consistent across desktop and mobile.
 */

interface ReaderViewProps {
    content: ContentItemWithSegments;
}

type HighlightJumpTarget = "highlight" | "segment";

const AuthorChat = dynamic(
    () => import("./AuthorChat").then((mod) => mod.AuthorChat),
    {
        loading: () => (
            <div className={`fixed inset-0 ${OVERLAY_LAYER_CLASS.popover} flex items-center justify-center bg-background/95 backdrop-blur-md`}>
                <div
                    role="status"
                    className="rounded-2xl border border-border/50 bg-card/70 px-5 py-3 text-sm font-medium text-muted-foreground"
                >
                    Opening chat...
                </div>
            </div>
        ),
        ssr: false,
    }
);

function escapeAttributeSelector(value: string) {
    return value.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

function wait(ms: number) {
    return new Promise((resolve) => window.setTimeout(resolve, ms));
}

export function ReaderView({ content }: ReaderViewProps) {
    const quickMode = content.quick_mode_json as QuickMode | null;
    const segmentIdSet = useMemo(() => new Set(content.segments.map((segment) => segment.id)), [content.segments]);
    const [maxSegmentIndex, setMaxSegmentIndex] = useState(-1);
    const [completedSegments, setCompletedSegments] = useState<Set<string>>(new Set());
    const [activeHighlightId, setActiveHighlightId] = useState<string | null>(null);
    const [popoverHighlightId, setPopoverHighlightId] = useState<string | null>(null);
    const [activeHighlightPosition, setActiveHighlightPosition] = useState<{
        top: number;
        left: number;
        width: number;
        height: number;
    } | null>(null);
    const [expandedSegmentId, setExpandedSegmentId] = useState<string | null>(null);
    const [isNotesDrawerOpen, setIsNotesDrawerOpen] = useState(false);
    const [isPopoverHovered, setIsPopoverHovered] = useState(false);
    const [popoverPortalEl, setPopoverPortalEl] = useState<HTMLDivElement | null>(null);
    const [showAuthorChat, setShowAuthorChat] = useState(false);
    const [audioCurrentTimeSec, setAudioCurrentTimeSec] = useState(0);
    const [audioDurationSec, setAudioDurationSec] = useState(0);
    const [initialAudioTimeSec, setInitialAudioTimeSec] = useState(0);
    const [hasSyncedAudioPosition, setHasSyncedAudioPosition] = useState(false);
    const [isAudioFollowEnabled, setIsAudioFollowEnabled] = useState(true);
    const [isAudioPlaying, setIsAudioPlaying] = useState(false);
    const [isAudioMiniPlayerVisible, setIsAudioMiniPlayerVisible] = useState(false);
    const [audioMiniPlayerBottomInset, setAudioMiniPlayerBottomInset] = useState(0);
    const [hasCompletedAudioPlayback, setHasCompletedAudioPlayback] = useState(false);
    const [hasPendingProgressSave, setHasPendingProgressSave] = useState(false);
    const [segmentScrollRequest, setSegmentScrollRequest] = useState<{
        segmentId: string;
        initialScrollY: number;
        requestId: number;
        focusAfterScroll?: boolean;
    } | null>(null);
    const latestAudioStateRef = useRef({ timeSec: 0, durationSec: 0 });
    const openedContentIdRef = useRef<string | null>(null);
    const lastPersistedAudioTimeRef = useRef<number | null>(null);
    const pendingProgressSaveRef = useRef(false);
    const progressSnapshotRef = useRef<ReadingProgressData | null>(null);
    const {
        saveReadingProgress,
        removeFromProgress,
        getProgress,
        isLoaded: readingProgressLoaded,
        storageScope,
    } = useReadingProgress();
    const previousStorageScopeRef = useRef(storageScope);
    const { data: highlights = [], isLoading: highlightsLoading, error: highlightsError } = useHighlights(content.id, { limit: 50 });
    const { readerTheme, fontFamily, fontSize, lineHeight } = useReaderSettings();
    const isReaderInteractionDesktop = useMediaQuery(VIEWPORT_QUERIES.readerInteractionDesktop);
    const router = useRouter();
    const pathname = usePathname();
    const searchParams = useSearchParams();
    const popoverHighlight = popoverHighlightId
        ? highlights.find((highlight) => highlight.id === popoverHighlightId) ?? null
        : null;
    const spotlightTimeoutRef = useRef<number | null>(null);
    const handledUrlHighlightRef = useRef<string | null>(null);
    const sectionMeta = useMemo(
        () =>
            content.segments.map((segment, index) => ({
                id: segment.id,
                title: segment.title || `Segment ${index + 1}`,
            })),
        [content.segments]
    );
    const activeNarrationSegmentId = useMemo(
        () => findSegmentIdForPlaybackTime(content.segments, audioCurrentTimeSec),
        [audioCurrentTimeSec, content.segments]
    );
    const activeNarratedSegmentId = isAudioPlaying
        ? activeNarrationSegmentId
        : null;
    const authorName = content.author || "the Author";

    useEffect(() => {
        if (openedContentIdRef.current === content.id) {
            return;
        }

        openedContentIdRef.current = content.id;
        captureAnalyticsEvent("content_opened", {
            content_id: content.id,
            content_type: content.type,
            category: content.category ?? undefined,
            source: "reader",
            route: "/read/[id]",
        });
    }, [content.category, content.id, content.type]);

    const handleAudioTimeChange = useCallback((timeSec: number, metadata?: { durationSec: number; isEnded: boolean }) => {
        latestAudioStateRef.current = {
            timeSec,
            durationSec: metadata?.durationSec ?? 0,
        };
        setHasSyncedAudioPosition(true);
        setHasCompletedAudioPlayback(Boolean(metadata?.isEnded));
        setAudioCurrentTimeSec(timeSec);
        setAudioDurationSec(metadata?.durationSec ?? 0);
    }, []);
    const handleExpandedSegmentChange = useCallback((segmentId: string | null) => {
        setExpandedSegmentId(segmentId);

        if (
            !segmentId
            || !hasSyncedAudioPosition
            || !isAudioFollowEnabled
            || !activeNarrationSegmentId
            || segmentId === activeNarrationSegmentId
        ) {
            return;
        }

        setIsAudioFollowEnabled(false);
    }, [activeNarrationSegmentId, hasSyncedAudioPosition, isAudioFollowEnabled]);
    const requestSegmentScroll = useCallback((segmentId: string, initialScrollY = window.scrollY, options?: { focusAfterScroll?: boolean }) => {
        setSegmentScrollRequest((previous) => ({
            segmentId,
            initialScrollY,
            focusAfterScroll: options?.focusAfterScroll,
            requestId: (previous?.requestId ?? 0) + 1,
        }));
    }, []);
    const resumeAudioFollow = useCallback(() => {
        setIsAudioFollowEnabled(true);

        if (activeNarrationSegmentId) {
            setExpandedSegmentId(activeNarrationSegmentId);
            requestSegmentScroll(activeNarrationSegmentId, window.scrollY, { focusAfterScroll: true });
        }
    }, [activeNarrationSegmentId, requestSegmentScroll]);

    // Track reading time once at the reader level and pass display text down.
    const { formattedTime } = useReadingTimer(content.id);

    const savedProgress = getProgress(content.id);
    const buildProgressSnapshot = useCallback((
        completedSegmentIds: Set<string>,
        lastSegmentIndex: number,
    ): ReadingProgressData | null => {
        const hasMeaningfulProgress = completedSegmentIds.size > 0 || lastSegmentIndex >= 0;
        if (!hasMeaningfulProgress) {
            return null;
        }

        const isCompleted = content.segments.length > 0
            && content.segments.every((segment) => completedSegmentIds.has(segment.id));

        return {
            completed: Array.from(completedSegmentIds),
            lastSegmentIndex,
            maxSegmentIndex: lastSegmentIndex,
            lastReadAt: new Date().toISOString(),
            isCompleted,
            itemId: content.id,
            totalSegments: content.segments.length,
        };
    }, [content.id, content.segments]);
    const progressSnapshot = useMemo<ReadingProgressData | null>(
        () => buildProgressSnapshot(completedSegments, maxSegmentIndex),
        [buildProgressSnapshot, completedSegments, maxSegmentIndex]
    );
    const persistReadingProgress = useCallback((progressData: ReadingProgressData | null = progressSnapshotRef.current) => {
        if (!readingProgressLoaded || !progressData) {
            return false;
        }

        saveReadingProgress(content.id, progressData);
        setHasPendingProgressSave(false);
        return true;
    }, [content.id, readingProgressLoaded, saveReadingProgress]);

    const persistAudioResume = useCallback((timeSec: number, durationSec: number, force = false) => {
        if (typeof window === "undefined" || !content.audio_url) {
            return;
        }

        const roundedTimeSec = Math.max(0, Math.floor(timeSec));
        const effectiveDurationSec = Number.isFinite(durationSec) ? Math.max(0, durationSec) : 0;

        if (
            roundedTimeSec < 1
            || (effectiveDurationSec > 0 && roundedTimeSec >= Math.max(0, Math.floor(effectiveDurationSec) - 1))
        ) {
            clearScopedAudioResume(localStorage, storageScope, content.id);
            lastPersistedAudioTimeRef.current = 0;
            return;
        }

        if (
            !force
            && lastPersistedAudioTimeRef.current !== null
            && Math.abs(roundedTimeSec - lastPersistedAudioTimeRef.current) < 5
        ) {
            return;
        }

        writeScopedAudioResume(localStorage, storageScope, content.id, {
            currentTimeSec: roundedTimeSec,
            lastUpdatedAt: new Date().toISOString(),
            audioSource: content.audio_url,
        });
        lastPersistedAudioTimeRef.current = roundedTimeSec;
    }, [content.audio_url, content.id, storageScope]);

    // Load progress from scoped storage on mount and account changes
    useEffect(() => {
        progressSnapshotRef.current = progressSnapshot;
    }, [progressSnapshot]);

    useEffect(() => {
        pendingProgressSaveRef.current = hasPendingProgressSave;
    }, [hasPendingProgressSave]);

    useEffect(() => {
        if (!savedProgress) {
            setCompletedSegments(new Set());
            setMaxSegmentIndex(-1);
            setHasPendingProgressSave(false);
            return;
        }

        const sanitizedCompletedSegments = (savedProgress.completed || []).filter((segmentId) => segmentIdSet.has(segmentId));
        setCompletedSegments(new Set(sanitizedCompletedSegments));
        setMaxSegmentIndex(
            Math.min(
                content.segments.length - 1,
                Math.max(
                    -1,
                    typeof savedProgress.maxSegmentIndex === "number"
                        ? savedProgress.maxSegmentIndex
                        : savedProgress.lastSegmentIndex ?? -1,
                )
            ),
        );
        setHasPendingProgressSave(false);
    }, [content.segments.length, savedProgress, segmentIdSet]);

    useEffect(() => {
        setAudioCurrentTimeSec(0);
        setAudioDurationSec(0);
        setInitialAudioTimeSec(0);
        setHasSyncedAudioPosition(false);
        setHasCompletedAudioPlayback(false);
        setIsAudioFollowEnabled(true);
        setIsAudioPlaying(false);
        lastPersistedAudioTimeRef.current = null;
        previousStorageScopeRef.current = storageScope;
        latestAudioStateRef.current = { timeSec: 0, durationSec: 0 };
        setExpandedSegmentId(null);
        setSegmentScrollRequest(null);
        setHasPendingProgressSave(false);
    }, [content.audio_url, content.id, storageScope]);

    useEffect(() => {
        if (typeof window === "undefined" || !content.audio_url) {
            previousStorageScopeRef.current = storageScope;
            return;
        }

        const scopeChanged = previousStorageScopeRef.current !== storageScope;
        previousStorageScopeRef.current = storageScope;

        if (scopeChanged && hasSyncedAudioPosition) {
            const { timeSec, durationSec } = latestAudioStateRef.current;
            persistAudioResume(timeSec, durationSec, true);
            return;
        }

        if (hasSyncedAudioPosition) {
            return;
        }

        const guestScope = getStorageScope(null);
        const hydratedResume =
            storageScope === guestScope
                ? readScopedAudioResume(localStorage, storageScope, content.id)
                : migrateScopedAudioResume(localStorage, guestScope, storageScope, content.id);

        if (hydratedResume && hydratedResume.audioSource !== content.audio_url) {
            clearScopedAudioResume(localStorage, storageScope, content.id);
            setExpandedSegmentId(null);
            return;
        }

        const resumeTimeSec = hydratedResume?.currentTimeSec ?? 0;
        setInitialAudioTimeSec(resumeTimeSec);

        if (resumeTimeSec <= 0) {
            setExpandedSegmentId(null);
            return;
        }

        setHasSyncedAudioPosition(true);
        setAudioCurrentTimeSec(resumeTimeSec);
        latestAudioStateRef.current = { timeSec: resumeTimeSec, durationSec: 0 };
        lastPersistedAudioTimeRef.current = Math.floor(resumeTimeSec);

        const resumedSegmentId = findSegmentIdForPlaybackTime(content.segments, resumeTimeSec);
        setExpandedSegmentId(resumedSegmentId);
    }, [
        content.audio_url,
        content.id,
        content.segments,
        hasSyncedAudioPosition,
        persistAudioResume,
        storageScope,
    ]);

    useEffect(() => {
        latestAudioStateRef.current.durationSec = audioDurationSec;
    }, [audioCurrentTimeSec, audioDurationSec]);

    useEffect(() => {
        if (popoverHighlightId && !popoverHighlight) {
            setPopoverHighlightId(null);
            setActiveHighlightPosition(null);
        }

        if (activeHighlightId && !highlights.some((highlight) => highlight.id === activeHighlightId)) {
            setActiveHighlightId(null);
        }
    }, [activeHighlightId, highlights, popoverHighlight, popoverHighlightId]);

    // Handle manual segment open
    const handleSegmentOpen = (segmentId: string, index: number) => {
        // Update max opened index
        setMaxSegmentIndex((prev) => Math.max(prev, index));
        setHasPendingProgressSave(true);
    };

    // Handle explicit segment completion
    const handleSegmentComplete = (segmentId: string, index: number) => {
        // Mark explicitly completed
        setCompletedSegments((prev) => {
            const next = new Set(prev);
            next.add(segmentId);
            return next;
        });

        // Update max opened index just in case
        setMaxSegmentIndex((prev) => Math.max(prev, index));
        setHasPendingProgressSave(true);
    };

    const handleFinishReading = useCallback(() => {
        if (content.segments.length === 0) {
            return;
        }

        const previousCompletedSegments = new Set(completedSegments);
        const previousMaxSegmentIndex = maxSegmentIndex;
        const previousProgress = buildProgressSnapshot(previousCompletedSegments, previousMaxSegmentIndex);
        const finalCompletedSegments = new Set(content.segments.map((segment) => segment.id));
        const finalMaxSegmentIndex = content.segments.length - 1;
        const finalProgress = buildProgressSnapshot(finalCompletedSegments, finalMaxSegmentIndex);

        setCompletedSegments(finalCompletedSegments);
        setMaxSegmentIndex(finalMaxSegmentIndex);
        setExpandedSegmentId(null);
        progressSnapshotRef.current = finalProgress;

        if (finalProgress && readingProgressLoaded) {
            saveReadingProgress(content.id, finalProgress);
            setHasPendingProgressSave(false);
        } else {
            setHasPendingProgressSave(true);
        }

        toast.success("Marked as finished", {
            action: {
                label: "Undo",
                onClick: () => {
                    setCompletedSegments(new Set(previousCompletedSegments));
                    setMaxSegmentIndex(previousMaxSegmentIndex);
                    progressSnapshotRef.current = previousProgress;

                    if (!readingProgressLoaded) {
                        setHasPendingProgressSave(Boolean(previousProgress));
                        return;
                    }

                    if (previousProgress) {
                        saveReadingProgress(content.id, previousProgress);
                    } else {
                        removeFromProgress(content.id);
                    }

                    setHasPendingProgressSave(false);
                    toast.success("Reading progress restored");
                },
            },
        });
    }, [
        buildProgressSnapshot,
        completedSegments,
        content.id,
        content.segments,
        maxSegmentIndex,
        readingProgressLoaded,
        removeFromProgress,
        saveReadingProgress,
    ]);

    // Derive book completion state
    const isBookCompleted = content.segments.length > 0 && content.segments.every((segment) => completedSegments.has(segment.id));

    useEffect(() => {
        setShowAuthorChat(false);
    }, [content.id, isBookCompleted]);

    // Save progress on changes (debounced)
    useEffect(() => {
        if (!readingProgressLoaded || !hasPendingProgressSave) return;

        const timeoutId = window.setTimeout(() => {
            persistReadingProgress();
        }, 1000);

        return () => window.clearTimeout(timeoutId);
    }, [hasPendingProgressSave, persistReadingProgress, readingProgressLoaded]);

    useEffect(() => {
        if (typeof window === "undefined") {
            return;
        }

        const flushPendingProgress = () => {
            if (!pendingProgressSaveRef.current) {
                return;
            }

            persistReadingProgress();
        };

        window.addEventListener("pagehide", flushPendingProgress);
        return () => {
            flushPendingProgress();
            window.removeEventListener("pagehide", flushPendingProgress);
        };
    }, [persistReadingProgress]);

    useEffect(() => {
        if (!hasSyncedAudioPosition || !content.audio_url) {
            return;
        }

        persistAudioResume(audioCurrentTimeSec, audioDurationSec);
    }, [audioCurrentTimeSec, audioDurationSec, content.audio_url, hasSyncedAudioPosition, persistAudioResume]);

    useEffect(() => {
        if (typeof window === "undefined" || !content.audio_url || !hasSyncedAudioPosition) {
            return;
        }

        const flushAudioResume = () => {
            const { timeSec, durationSec } = latestAudioStateRef.current;
            persistAudioResume(timeSec, durationSec, true);
        };

        window.addEventListener("pagehide", flushAudioResume);
        return () => {
            flushAudioResume();
            window.removeEventListener("pagehide", flushAudioResume);
        };
    }, [content.audio_url, hasSyncedAudioPosition, persistAudioResume]);

    // ── Keyboard Shortcuts (Fullscreen) ──────────────────────────
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            // Don't trigger if user is typing in an input/textarea
            if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
                return;
            }

            if (e.key.toLowerCase() === "f") {
                e.preventDefault();
                if (!document.fullscreenElement) {
                    document.documentElement.requestFullscreen().catch((err) => console.error(err));
                } else if (document.exitFullscreen) {
                    document.exitFullscreen();
                }
            }
        };

        window.addEventListener("keydown", handleKeyDown);
        return () => window.removeEventListener("keydown", handleKeyDown);
    }, []);

    useEffect(() => {
        if (!isReaderInteractionDesktop || !popoverHighlightId || isPopoverHovered) {
            return;
        }

        const handleScroll = () => {
            setPopoverHighlightId(null);
            setActiveHighlightPosition(null);
        };

        window.addEventListener("scroll", handleScroll, { passive: true });
        return () => window.removeEventListener("scroll", handleScroll);
    }, [popoverHighlightId, isReaderInteractionDesktop, isPopoverHovered]);

    useEffect(() => {
        return () => {
            if (spotlightTimeoutRef.current !== null) {
                window.clearTimeout(spotlightTimeoutRef.current);
            }
            document
                .querySelectorAll<HTMLElement>('mark[data-highlight-spotlight="true"]')
                .forEach((mark) => mark.removeAttribute("data-highlight-spotlight"));
        };
    }, []);

    useEffect(() => {
        if (!searchParams.get("highlightId")) {
            handledUrlHighlightRef.current = null;
        }
    }, [searchParams]);

    const closeActiveHighlight = () => {
        setPopoverHighlightId(null);
        setActiveHighlightPosition(null);
        setIsPopoverHovered(false);
    };

    const applyHighlightSpotlight = (highlightId: string, marks: HTMLElement[]) => {
        if (spotlightTimeoutRef.current !== null) {
            window.clearTimeout(spotlightTimeoutRef.current);
        }

        document
            .querySelectorAll<HTMLElement>('mark[data-highlight-spotlight="true"]')
            .forEach((mark) => mark.removeAttribute("data-highlight-spotlight"));

        marks.forEach((mark) => mark.setAttribute("data-highlight-spotlight", "true"));

        spotlightTimeoutRef.current = window.setTimeout(() => {
            document
                .querySelectorAll<HTMLElement>(`mark[data-id="${highlightId}"][data-highlight-spotlight="true"]`)
                .forEach((mark) => mark.removeAttribute("data-highlight-spotlight"));
        }, 1800);
    };

    const waitForSegmentExpansion = useCallback(async (segmentId: string) => {
        const segmentSelector = `[data-reader-segment-id="${escapeAttributeSelector(segmentId)}"]`;

        for (let attempt = 0; attempt < 12; attempt += 1) {
            const segmentEl = document.querySelector<HTMLElement>(segmentSelector);
            const panelEl = segmentEl?.querySelector<HTMLElement>('[data-reader-segment-panel="true"]');
            const isExpanded = segmentEl?.querySelector<HTMLButtonElement>('button[aria-expanded="true"]');

            if (panelEl && isExpanded) {
                await new Promise<void>((resolve) => {
                    let didResolve = false;
                    let timeoutId: number | null = null;

                    const finish = () => {
                        if (didResolve) return;
                        didResolve = true;
                        panelEl.removeEventListener("transitionend", handleTransitionEnd);
                        if (timeoutId !== null) {
                            window.clearTimeout(timeoutId);
                        }
                        resolve();
                    };

                    const handleTransitionEnd = (event: TransitionEvent) => {
                        if (event.target === panelEl) {
                            finish();
                        }
                    };

                    panelEl.addEventListener("transitionend", handleTransitionEnd);
                    timeoutId = window.setTimeout(finish, 380);
                });
                return;
            }

            await wait(80);
        }
    }, []);

    const waitForHighlightMarks = useCallback(async (highlightId: string, segmentId?: string | null): Promise<HTMLElement[]> => {
        const highlightSelector = `mark[data-id="${escapeAttributeSelector(highlightId)}"]`;
        const selector = segmentId
            ? `[data-reader-segment-id="${escapeAttributeSelector(segmentId)}"] ${highlightSelector}`
            : highlightSelector;

        for (let attempt = 0; attempt < 12; attempt += 1) {
            const marks = Array.from(
                document.querySelectorAll<HTMLElement>(selector)
            );

            if (marks.length > 0) {
                return marks;
            }

            await new Promise((resolve) => window.setTimeout(resolve, 80));
        }

        return [];
    }, []);

    const scrollSegmentTopIntoView = useCallback((segmentId: string) => {
        const segmentEl = document.querySelector<HTMLElement>(
            `[data-reader-segment-id="${escapeAttributeSelector(segmentId)}"]`
        );
        if (!segmentEl) return false;

        const top = segmentEl.getBoundingClientRect().top + window.scrollY - 100;
        window.scrollTo({ top: Math.max(0, top), behavior: "smooth" });
        return true;
    }, []);

    const handleHighlightJump = useCallback(async (
        highlightId: string,
        options: { target?: HighlightJumpTarget } = {}
    ) => {
        const highlight = highlights.find((item) => item.id === highlightId);
        if (!highlight) return;

        setActiveHighlightId(highlightId);
        setPopoverHighlightId(null);
        setActiveHighlightPosition(null);
        setIsPopoverHovered(false);

        const targetSegmentId = highlight.segment_id;
        const shouldWaitForExpansion = Boolean(targetSegmentId && expandedSegmentId !== targetSegmentId);

        if (highlight.segment_id) {
            setExpandedSegmentId(highlight.segment_id);
        }

        if (targetSegmentId && shouldWaitForExpansion) {
            await waitForSegmentExpansion(targetSegmentId);
        }

        const jumpTarget = options.target ?? "highlight";
        const didScrollToSegment = jumpTarget === "segment" && targetSegmentId
            ? scrollSegmentTopIntoView(targetSegmentId)
            : false;
        const marks = await waitForHighlightMarks(highlightId, targetSegmentId);

        if (!didScrollToSegment && marks.length > 0) {
            const [firstMark] = marks;
            const top = firstMark.getBoundingClientRect().top + window.scrollY - 120;
            window.scrollTo({ top: Math.max(0, top), behavior: "smooth" });
        }

        if (marks.length > 0) {
            applyHighlightSpotlight(highlightId, marks);
        }
    }, [expandedSegmentId, highlights, scrollSegmentTopIntoView, waitForHighlightMarks, waitForSegmentExpansion]);

    useEffect(() => {
        const urlHighlightId = searchParams.get("highlightId");
        if (!urlHighlightId || highlightsLoading) {
            return;
        }

        if (handledUrlHighlightRef.current === urlHighlightId) {
            return;
        }

        handledUrlHighlightRef.current = urlHighlightId;

        const clearUrlParam = () => {
            router.replace(pathname, { scroll: false });
        };

        if (!highlights.some((highlight) => highlight.id === urlHighlightId)) {
            clearUrlParam();
            return;
        }

        void handleHighlightJump(urlHighlightId).finally(clearUrlParam);
    }, [handleHighlightJump, highlights, highlightsLoading, pathname, router, searchParams]);

    useEffect(() => {
        if (
            !isAudioFollowEnabled
            || !hasSyncedAudioPosition
            || !activeNarrationSegmentId
            || expandedSegmentId === activeNarrationSegmentId
        ) {
            return;
        }

        const initialScrollY = window.scrollY;
        setExpandedSegmentId(activeNarrationSegmentId);
        requestSegmentScroll(activeNarrationSegmentId, initialScrollY);
    }, [activeNarrationSegmentId, expandedSegmentId, hasSyncedAudioPosition, isAudioFollowEnabled, requestSegmentScroll]);

    useEffect(() => {
        if (!hasSyncedAudioPosition) {
            return;
        }

        const completedByAudio = hasCompletedAudioPlayback
            ? content.segments.map((segment) => segment.id)
            : findCompletedSegmentIdsForPlaybackTime(content.segments, audioCurrentTimeSec);
        if (completedByAudio.length === 0) {
            return;
        }

        const nextCompletedSegments = new Set(completedSegments);
        for (const segmentId of completedByAudio) {
            nextCompletedSegments.add(segmentId);
        }

        const didAdvanceCompletedSegments = nextCompletedSegments.size !== completedSegments.size;

        const completedSegmentIdSet = new Set(completedByAudio);
        const furthestCompletedIndex = content.segments.reduce((maxIndex, segment, index) => {
            if (!completedSegmentIdSet.has(segment.id)) {
                return maxIndex;
            }

            return Math.max(maxIndex, index);
        }, -1);

        const nextMaxSegmentIndex = furthestCompletedIndex >= 0
            ? Math.max(maxSegmentIndex, furthestCompletedIndex)
            : maxSegmentIndex;
        const didAdvanceMaxSegmentIndex = nextMaxSegmentIndex !== maxSegmentIndex;

        if (!didAdvanceCompletedSegments && !didAdvanceMaxSegmentIndex) {
            return;
        }

        if (didAdvanceCompletedSegments) {
            setCompletedSegments(nextCompletedSegments);
        }

        if (didAdvanceMaxSegmentIndex) {
            setMaxSegmentIndex(nextMaxSegmentIndex);
        }

        setHasPendingProgressSave(true);
    }, [audioCurrentTimeSec, completedSegments, content.segments, hasCompletedAudioPlayback, hasSyncedAudioPosition, maxSegmentIndex]);

    return (
        <div className={`min-h-screen bg-background font-sans text-foreground transition-colors duration-300 reader-${readerTheme} reader-font-${fontFamily} reader-spacing-${lineHeight}`}>
            <div ref={setPopoverPortalEl} aria-hidden="true" />
            <div
                className={cn(
                    "max-w-3xl mx-auto px-5 sm:px-6 pt-8 transition-[padding-bottom] duration-300 sm:pt-12",
                    isAudioMiniPlayerVisible
                        ? "reader-audio-content-clearance"
                        : "pb-8 sm:pb-8 lg:pb-24"
                )}
                style={{
                    "--reader-audio-viewport-bottom": `${audioMiniPlayerBottomInset}px`,
                } as React.CSSProperties}
            >
                {/* Hero Header */}
                <ReaderHeroHeader
                    contentId={content.id}
                    title={content.title}
                    author={content.author}
                    type={content.type}
                    coverImageUrl={content.cover_image_url}
                    audioUrl={content.audio_url}
                    durationSeconds={content.duration_seconds}
                    segmentsTotal={content.segments.length}
                    segmentsCompleted={completedSegments.size}
                    formattedReadingTime={formattedTime}
                    readerTheme={readerTheme}
                    showResumeAudioFollow={hasSyncedAudioPosition && !isAudioFollowEnabled && Boolean(activeNarrationSegmentId)}
                    isNotesDrawerOpen={isNotesDrawerOpen}
                    onMiniPlayerVisibilityChange={setIsAudioMiniPlayerVisible}
                    onMiniPlayerBottomInsetChange={setAudioMiniPlayerBottomInset}
                    onResumeAudioFollow={resumeAudioFollow}
                    initialAudioTimeSec={initialAudioTimeSec}
                    onAudioTimeChange={handleAudioTimeChange}
                    onAudioPlaybackStateChange={setIsAudioPlaying}
                />

                {content.seriesContext && (
                    <div className="mb-5 space-y-3">
                        <div className="flex flex-col gap-1.5 sm:flex-row sm:items-end sm:justify-between">
                            <div className="min-w-0">
                                <p className="text-lg font-semibold tracking-tight text-foreground sm:text-xl">
                                    Part {content.seriesContext.currentOrder} of {content.seriesContext.totalItems} in {content.seriesContext.series.title}
                                </p>
                            </div>

                            <Link
                                href={`/series/${content.seriesContext.series.slug}`}
                                className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground hover:underline"
                            >
                                <List className="size-3" />
                                View all parts
                            </Link>
                        </div>

                        <div className="grid gap-2 sm:grid-cols-2">
                            {content.seriesContext.previousItem ? (
                                <Link
                                    href={buildCanonicalReadPath(
                                        content.seriesContext.previousItem.id,
                                        content.seriesContext.previousItem.title
                                    )}
                                    className="flex min-h-12 w-full min-w-0 items-center justify-between overflow-hidden rounded-2xl border border-border/50 bg-background/55 px-3 py-2 transition-colors hover:border-primary/35 hover:bg-accent/25"
                                >
                                    <div className="min-w-0 flex-1 pr-3">
                                        <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                                            Previous
                                        </p>
                                        <p className="truncate text-sm font-medium text-foreground">
                                            {content.seriesContext.previousItem.title}
                                        </p>
                                    </div>
                                    <ArrowLeft className="size-4 flex-shrink-0 text-muted-foreground" />
                                </Link>
                            ) : (
                                <div className="flex min-h-12 w-full min-w-0 items-center rounded-2xl border border-dashed border-border/45 px-3 py-2 text-sm text-muted-foreground/85">
                                    Start of the series
                                </div>
                            )}

                            {content.seriesContext.nextItem ? (
                                <Link
                                    href={buildCanonicalReadPath(
                                        content.seriesContext.nextItem.id,
                                        content.seriesContext.nextItem.title
                                    )}
                                    className="flex min-h-12 w-full min-w-0 items-center justify-between overflow-hidden rounded-2xl border border-primary/15 bg-primary/[0.07] px-3 py-2 transition-colors hover:border-primary/30 hover:bg-primary/[0.1]"
                                >
                                    <div className="min-w-0 flex-1 pr-3">
                                        <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                                            Next up
                                        </p>
                                        <p className="truncate text-sm font-medium text-foreground">
                                            {content.seriesContext.nextItem.title}
                                        </p>
                                    </div>
                                    <ArrowRight className="size-4 flex-shrink-0 text-primary" />
                                </Link>
                            ) : (
                                <div className="flex min-h-12 w-full min-w-0 items-center rounded-2xl border border-dashed border-border/45 px-3 py-2 text-sm text-muted-foreground/85">
                                    End of the series
                                </div>
                            )}
                        </div>
                    </div>
                )}

                {/* Big Idea - Context before segments */}
                {quickMode?.big_idea && (
                    <div className="bg-card/40 rounded-xl p-6 sm:p-8 border border-border/40 mb-8">
                        <h3 className="text-sm font-bold text-primary uppercase tracking-[0.2em] mb-3">
                            The Big Idea
                        </h3>
                        <div className={`reader-size-${fontSize} reading-copy reading-copy-default font-medium`}>
                            {quickMode.big_idea}
                        </div>
                    </div>
                )}

                {/* Accordion Sections */}
                <SegmentAccordion
                    segments={content.segments}
                    completedSegments={completedSegments}
                    onSegmentOpen={handleSegmentOpen}
                    onSegmentComplete={handleSegmentComplete}
                    onFinishReading={handleFinishReading}
                    highlights={highlights}
                    expandedSegmentId={expandedSegmentId}
                    onExpandedSegmentChange={handleExpandedSegmentChange}
                    scrollRequest={segmentScrollRequest}
                    activeNarratedSegmentId={activeNarratedSegmentId}
                    onHighlightActivate={(highlightId, position) => {
                        setActiveHighlightId(highlightId);
                        if (isReaderInteractionDesktop) {
                            setPopoverHighlightId(highlightId);
                            setActiveHighlightPosition(position);
                            return;
                        }

                        setPopoverHighlightId(null);
                        setActiveHighlightPosition(null);
                        setIsPopoverHovered(false);
                        setIsNotesDrawerOpen(true);
                    }}
                />

                {!isBookCompleted && (
                    <div className="mt-8 rounded-2xl border border-border/60 bg-card/60 p-5">
                        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                            <div className="min-w-0">
                                <div className="flex items-center gap-3">
                                    <div className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-primary/12 text-primary">
                                        <MessageCircleQuestion className="size-5" />
                                    </div>
                                    <div>
                                        <h2 className="text-base font-semibold text-foreground">
                                            Ask {authorName}
                                        </h2>
                                        <p className="text-sm text-muted-foreground">
                                            Jump into the ideas before you finish the whole summary.
                                        </p>
                                    </div>
                                </div>
                            </div>
                            <button
                                type="button"
                                onClick={() => setShowAuthorChat(true)}
                                className="inline-flex items-center justify-center rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90"
                            >
                                Discuss ideas
                            </button>
                        </div>
                    </div>
                )}

                {/* Completion Card or Content Feedback */}
                {isBookCompleted ? (
                    <CompletionCard
                        contentId={content.id}
                        title={content.title}
                        author={content.author}
                        segmentCount={content.segments.length}
                        readerTheme={readerTheme}
                    />
                ) : (
                    <ContentFeedback contentId={content.id} />
                )}
            </div>

            {/* Floating elements — rendered OUTSIDE the content wrapper so position:fixed works correctly */}
            {isReaderInteractionDesktop && <TextSelectionToolbar contentItemId={content.id} />}
            {!isReaderInteractionDesktop && (
                <MobileSelectionActions
                    contentItemId={content.id}
                    contentTitle={content.title}
                    sections={sectionMeta}
                />
            )}
            <NotesDrawer
                isOpen={isNotesDrawerOpen}
                onOpenChange={setIsNotesDrawerOpen}
                highlights={highlights}
                isLoading={highlightsLoading}
                hasError={Boolean(highlightsError)}
                sections={sectionMeta}
                activeHighlightId={activeHighlightId}
                isAudioMiniPlayerVisible={isAudioMiniPlayerVisible}
                onHighlightJump={(highlightId) => handleHighlightJump(highlightId, { target: "segment" })}
            />
            {isReaderInteractionDesktop && popoverHighlight && activeHighlightPosition && popoverPortalEl && (
                <HighlightPopover
                    highlightId={popoverHighlight.id}
                    contentItemId={content.id}
                    noteBody={popoverHighlight.note_body}
                    highlightedText={popoverHighlight.highlighted_text}
                    currentColor={popoverHighlight.color || "yellow"}
                    position={activeHighlightPosition}
                    portalContainer={popoverPortalEl}
                    createdAt={popoverHighlight.created_at || undefined}
                    onClose={closeActiveHighlight}
                    onMouseEnter={() => setIsPopoverHovered(true)}
                    onMouseLeave={() => {
                        setIsPopoverHovered(false);
                        closeActiveHighlight();
                    }}
                />
            )}
            {showAuthorChat && (
                <AuthorChat
                    contentId={content.id}
                    authorName={authorName}
                    contentTitle={content.title}
                    hasCompletedReading={isBookCompleted}
                    readerTheme={readerTheme}
                    onClose={() => setShowAuthorChat(false)}
                />
            )}
        </div>
    );
}
