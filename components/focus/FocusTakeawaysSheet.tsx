import Link from "next/link";
import type { MutableRefObject, TouchEvent as ReactTouchEvent } from "react";
import { BookOpen, X } from "lucide-react";
import { buildReadPath } from "@/lib/content-paths";
import type { FocusCard } from "@/components/focus/focus-feed-utils";
import {
    TAKEAWAYS_SHEET_BACKDROP_OPEN_DURATION_MS,
    TAKEAWAYS_SHEET_CLOSE_DURATION_MS,
    TAKEAWAYS_SHEET_OPEN_DURATION_MS,
    type SheetTouchPoint,
    type TakeawaysSheetPhase,
} from "@/components/focus/focus-feed-layout";

const TAKEAWAYS_SHEET_CLOSE_DRAG_THRESHOLD_PX = 80;
const TAKEAWAYS_SHEET_CLOSE_FLICK_DISTANCE_PX = 24;
const TAKEAWAYS_SHEET_CLOSE_VELOCITY_PX_PER_MS = 0.45;

export function FocusTakeawaysSheet({
    card,
    dragOffset,
    phase,
    prefersReducedMotion,
    onClose,
    onDragOffsetChange,
    touchStartYRef,
    touchLastPointRef,
    touchVelocityRef,
    dialogRef,
    closeButtonRef,
}: {
    card: FocusCard;
    dragOffset: number;
    phase: TakeawaysSheetPhase;
    prefersReducedMotion: boolean;
    onClose: () => void;
    onDragOffsetChange: (offset: number) => void;
    touchStartYRef: MutableRefObject<number | null>;
    touchLastPointRef: MutableRefObject<SheetTouchPoint | null>;
    touchVelocityRef: MutableRefObject<number>;
    dialogRef: MutableRefObject<HTMLDivElement | null>;
    closeButtonRef: MutableRefObject<HTMLButtonElement | null>;
}) {
    const handleTouchStart = (event: ReactTouchEvent<HTMLDivElement>) => {
        if (event.touches.length !== 1) {
            touchStartYRef.current = null;
            touchLastPointRef.current = null;
            touchVelocityRef.current = 0;
            return;
        }

        const startY = event.touches[0]?.clientY ?? null;
        const now = performance.now();
        touchStartYRef.current = startY;
        touchLastPointRef.current = startY === null ? null : { y: startY, time: now };
        touchVelocityRef.current = 0;
    };

    const handleTouchMove = (event: ReactTouchEvent<HTMLDivElement>) => {
        if (touchStartYRef.current === null || event.touches.length !== 1) {
            return;
        }

        const currentY = event.touches[0]?.clientY ?? touchStartYRef.current;
        const nextOffset = Math.max(0, currentY - touchStartYRef.current);
        const now = performance.now();
        const lastPoint = touchLastPointRef.current;
        if (lastPoint) {
            const elapsed = Math.max(now - lastPoint.time, 1);
            touchVelocityRef.current = (currentY - lastPoint.y) / elapsed;
        }
        touchLastPointRef.current = { y: currentY, time: now };
        onDragOffsetChange(Math.min(nextOffset, 160));
    };

    const handleTouchEnd = () => {
        const shouldCloseByDrag = dragOffset > TAKEAWAYS_SHEET_CLOSE_DRAG_THRESHOLD_PX;
        const shouldCloseByFlick =
            dragOffset > TAKEAWAYS_SHEET_CLOSE_FLICK_DISTANCE_PX
            && touchVelocityRef.current > TAKEAWAYS_SHEET_CLOSE_VELOCITY_PX_PER_MS;

        if (shouldCloseByDrag || shouldCloseByFlick) {
            onClose();
            return;
        }

        touchStartYRef.current = null;
        touchLastPointRef.current = null;
        touchVelocityRef.current = 0;
        onDragOffsetChange(0);
    };

    const isDragging = dragOffset > 0;
    const shouldAnimateMotion = !prefersReducedMotion && !isDragging;
    const isExiting = phase === "exiting";
    const backdropOpacityClass =
        phase === "entered" ? "opacity-100" : "opacity-0";
    const sheetTranslateY = isDragging
        ? dragOffset
        : prefersReducedMotion
            ? 0
            : phase === "entering"
                ? 24
                : phase === "exiting"
                    ? 20
                    : 0;
    const sheetOpacity = prefersReducedMotion
        ? 1
        : phase === "entered"
            ? 1
            : 0.94;
    const backdropTransitionStyle = prefersReducedMotion
        ? undefined
        : {
            transitionDuration: `${isExiting ? TAKEAWAYS_SHEET_CLOSE_DURATION_MS : TAKEAWAYS_SHEET_BACKDROP_OPEN_DURATION_MS}ms`,
            transitionTimingFunction: isExiting ? "ease-in" : "ease-out",
        };
    const sheetTransitionStyle = shouldAnimateMotion
        ? {
            transitionDuration: `${isExiting ? TAKEAWAYS_SHEET_CLOSE_DURATION_MS : TAKEAWAYS_SHEET_OPEN_DURATION_MS}ms`,
            transitionTimingFunction: isExiting ? "ease-in" : "ease-out",
            transform: `translateY(${sheetTranslateY}px)`,
            opacity: sheetOpacity,
        }
        : {
            transform: `translateY(${sheetTranslateY}px)`,
            opacity: sheetOpacity,
        };

    return (
        <div className="fixed inset-0 z-[80] lg:hidden" aria-hidden={false}>
            <button
                type="button"
                data-testid="focus-takeaways-sheet-backdrop"
                className={`absolute inset-0 bg-black/60 backdrop-blur-sm ${prefersReducedMotion ? "" : "transition-opacity"} ${backdropOpacityClass}`}
                aria-label="Close preview"
                onClick={onClose}
                style={backdropTransitionStyle}
            />

            <div
                data-testid="focus-takeaways-sheet-frame"
                className="absolute inset-x-0 bottom-0 px-5 pb-[max(0.75rem,env(safe-area-inset-bottom))]"
            >
                <div
                    role="dialog"
                    aria-modal="true"
                    aria-label={`Preview for ${card.title}`}
                    data-testid="focus-takeaways-sheet"
                    ref={dialogRef}
                    tabIndex={-1}
                    className={`mx-auto flex max-h-[min(82svh,calc(100svh-1rem))] w-full max-w-md flex-col overflow-hidden rounded-[1.75rem] border border-border/60 bg-background shadow-2xl ${prefersReducedMotion ? "" : "transition-transform transition-opacity"}`}
                    style={sheetTransitionStyle}
                >
                    <div
                        className="relative flex justify-center px-4 pt-3 pb-2"
                        onTouchStart={handleTouchStart}
                        onTouchMove={handleTouchMove}
                        onTouchEnd={handleTouchEnd}
                        onTouchCancel={handleTouchEnd}
                    >
                        <div className="mx-auto h-1.5 w-12 rounded-full bg-muted-foreground/30" />
                        <button
                            type="button"
                            onClick={onClose}
                            ref={closeButtonRef}
                            data-testid="focus-takeaways-sheet-close"
                            className="focus-ring absolute right-3 top-2 rounded-full p-2 text-muted-foreground transition-colors hover:bg-secondary/60 hover:text-foreground"
                            aria-label="Close preview"
                        >
                            <X className="size-4" />
                        </button>
                    </div>

                    <div className="flex-1 overflow-y-auto px-4 pt-3 pb-4">
                        <div className="space-y-3">
                            {card.takeaways.map((takeaway, index) => (
                                <div
                                    key={`${card.id}-sheet-${index}`}
                                    className="flex gap-3 text-[0.92rem] leading-[1.55] text-foreground/90"
                                >
                                    <span className="mt-0.5 text-[11px] font-semibold text-primary">
                                        {String(index + 1).padStart(2, "0")}
                                    </span>
                                    <span>{takeaway}</span>
                                </div>
                            ))}
                        </div>
                    </div>

                    <div className="border-t border-border/40 px-4 pt-3 pb-[max(1rem,env(safe-area-inset-bottom))]">
                        <Link
                            href={buildReadPath(card)}
                            className="focus-ring inline-flex h-12 w-full items-center justify-center gap-2 rounded-full bg-primary px-4 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
                            aria-label={`Read ${card.title}`}
                        >
                            <BookOpen className="size-4" />
                            Read
                        </Link>
                    </div>
                </div>
            </div>
        </div>
    );
}
