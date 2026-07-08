import Link from "next/link";
import { memo, useEffect, useLayoutEffect, useRef, useState } from "react";
import { BookOpen, ChevronDown, Info } from "lucide-react";
import { ResilientImage } from "@/components/ui/ResilientImage";
import { ShareButton } from "@/components/ui/ShareButton";
import { LibrarySaveButton } from "@/components/ui/LibrarySaveButton";
import { buildReadPath } from "@/lib/content-paths";
import type { FocusCard } from "@/components/focus/focus-feed-utils";
import {
    MAX_DESKTOP_COMPACT_LEVEL,
    FEED_CARD_HEIGHT_CLASS,
    MOBILE_MIN_READABLE_HOOK_HEIGHT_PX,
    type DesktopCompactLevel,
    formatDuration,
    getDesktopAvailableContentHeight,
    getDesktopCoverWidth,
    getInitialDesktopCompactLevel,
    getDesktopVisibleTakeawayCount,
    getMobileAvailableContentHeight,
    getMobileHookMaxHeight,
} from "@/components/focus/focus-feed-layout";

const DESKTOP_COMPACT_CLASSES = [
    {
        layoutGap: "gap-3",
        headerSpacing: "space-y-3",
        titleClamp: "line-clamp-3",
        metadataSpacing: "space-y-1",
        hookPadding: "py-2 pl-5 pr-4",
        hookClamp: "line-clamp-6",
        actionsSpacing: "gap-3 pt-1 md:pt-0.5",
    },
    {
        layoutGap: "gap-2.5",
        headerSpacing: "space-y-2.5",
        titleClamp: "line-clamp-3",
        metadataSpacing: "space-y-1",
        hookPadding: "py-2 pl-5 pr-4",
        hookClamp: "line-clamp-5",
        actionsSpacing: "gap-3 pt-0.5",
    },
    {
        layoutGap: "gap-2",
        headerSpacing: "space-y-2",
        titleClamp: "line-clamp-2",
        metadataSpacing: "space-y-0.5",
        hookPadding: "py-2 pl-4 pr-4",
        hookClamp: "line-clamp-4",
        actionsSpacing: "gap-2.5 pt-0",
    },
    {
        layoutGap: "gap-1.5",
        headerSpacing: "space-y-1.5",
        titleClamp: "line-clamp-2",
        metadataSpacing: "space-y-0.5",
        hookPadding: "py-1.5 pl-4 pr-4",
        hookClamp: "line-clamp-4",
        actionsSpacing: "gap-2 pt-0",
    },
] as const;

type DesktopTakeawayClasses = {
    contentSpacing: string;
    takeawayGap: string;
    takeawayClamp: string;
};

const DESKTOP_TAKEAWAY_CLASSES: readonly DesktopTakeawayClasses[] = [
    {
        contentSpacing: "space-y-2.5",
        takeawayGap: "gap-2",
        takeawayClamp: "line-clamp-3",
    },
    {
        contentSpacing: "space-y-2",
        takeawayGap: "gap-2",
        takeawayClamp: "line-clamp-3",
    },
    {
        contentSpacing: "space-y-1.5",
        takeawayGap: "gap-1.5",
        takeawayClamp: "line-clamp-2",
    },
] as const;

function getDesktopTakeawayClasses(compactLevel: DesktopCompactLevel) {
    if (compactLevel >= DESKTOP_TAKEAWAY_CLASSES.length) {
        return null;
    }

    return DESKTOP_TAKEAWAY_CLASSES[compactLevel] ?? null;
}

export const FocusCardView = memo(function FocusCardView({
    card,
    cardIndex,
    isSaved,
    isFocusDesktop,
    isActive,
    showDesktopScrollCue,
    mobileCardTargetHeight,
    onOpenTakeaways,
    onToggleSave,
}: {
    card: FocusCard;
    cardIndex: number;
    isSaved: boolean;
    isFocusDesktop: boolean;
    isActive: boolean;
    showDesktopScrollCue: boolean;
    mobileCardTargetHeight: number | null;
    onOpenTakeaways: (card: FocusCard, opener: HTMLElement) => void;
    onToggleSave: (card: FocusCard) => void;
}) {
    const duration = formatDuration(card.duration_seconds);
    const [mobileHookMaxHeight, setMobileHookMaxHeight] = useState<number | null>(null);
    const cardRef = useRef<HTMLElement | null>(null);
    const cardContentRef = useRef<HTMLDivElement | null>(null);
    const hookBodyRef = useRef<HTMLDivElement | null>(null);
    const mobileHookFitKeyRef = useRef<string | null>(null);
    const [cardWidth, setCardWidth] = useState(0);
    const desktopAvailableContentHeight = mobileCardTargetHeight === null || mobileCardTargetHeight <= 0
        ? 720
        : getDesktopAvailableContentHeight(mobileCardTargetHeight);
    const heuristicDesktopCompactLevel = getInitialDesktopCompactLevel(desktopAvailableContentHeight);
    const desktopFitKey = isFocusDesktop && cardWidth > 0 && mobileCardTargetHeight !== null
        ? `${card.id}:${cardWidth}:${mobileCardTargetHeight}`
        : null;
    const [measuredDesktopCompactLevel, setMeasuredDesktopCompactLevel] = useState<{
        key: string;
        level: DesktopCompactLevel;
    } | null>(null);
    const desktopCompactLevel = isFocusDesktop
        ? Math.max(
            heuristicDesktopCompactLevel,
            measuredDesktopCompactLevel?.key === desktopFitKey
                ? measuredDesktopCompactLevel.level
                : heuristicDesktopCompactLevel
        ) as DesktopCompactLevel
        : 0;
    const desktopCompactClasses = DESKTOP_COMPACT_CLASSES[desktopCompactLevel];
    const desktopTakeawayClasses = getDesktopTakeawayClasses(desktopCompactLevel);
    const desktopCoverWidth = getDesktopCoverWidth({
        availableContentHeight: desktopAvailableContentHeight,
        compactLevel: desktopCompactLevel,
    });
    const desktopVisibleTakeawayCount = isFocusDesktop
        ? getDesktopVisibleTakeawayCount({
            availableContentHeight: desktopAvailableContentHeight,
            totalTakeaways: card.takeaways.length,
            compactLevel: desktopCompactLevel,
        })
        : card.takeaways.length;
    const desktopVisibleTakeaways = card.takeaways.slice(0, desktopVisibleTakeawayCount);
    const shouldShowDesktopTakeaways =
        isFocusDesktop
        && desktopTakeawayClasses !== null
        && (desktopVisibleTakeawayCount > 0 || card.takeaways.length === 0);
    const isCompactMobileLayout =
        !isFocusDesktop
        && mobileHookMaxHeight !== null
        && mobileHookMaxHeight <= MOBILE_MIN_READABLE_HOOK_HEIGHT_PX;
    const isDesktopTakeawaysTruncated =
        isFocusDesktop
        && desktopVisibleTakeawayCount < card.takeaways.length;
    const desktopTakeawaysHeading = isDesktopTakeawaysTruncated
        ? `Key Takeaways (${desktopVisibleTakeaways.length} of ${card.totalTakeaways})`
        : "Key Takeaways";

    useEffect(() => {
        const cardElement = cardRef.current;
        if (!cardElement) {
            setCardWidth(0);
            return;
        }

        const updateCardWidth = () => {
            const nextWidth = Math.round(cardElement.getBoundingClientRect().width);
            setCardWidth((currentWidth) => (currentWidth === nextWidth ? currentWidth : nextWidth));
        };

        updateCardWidth();

        const observer = new ResizeObserver(() => {
            updateCardWidth();
        });

        observer.observe(cardElement);

        return () => observer.disconnect();
    }, []);

    useEffect(() => {
        if (isFocusDesktop) {
            setMobileHookMaxHeight(null);
            return;
        }

        setMobileHookMaxHeight(null);
    }, [card.id, isFocusDesktop]);

    useLayoutEffect(() => {
        if (isFocusDesktop || mobileCardTargetHeight === null) {
            mobileHookFitKeyRef.current = null;
            return;
        }

        const cardElement = cardRef.current;
        const cardContentElement = cardContentRef.current;
        if (!cardElement || !cardContentElement) {
            return;
        }

        const fitKey = `${card.id}:${cardWidth}:${mobileCardTargetHeight}`;
        const didFitInputsChange = mobileHookFitKeyRef.current !== fitKey;
        mobileHookFitKeyRef.current = fitKey;

        if (didFitInputsChange && mobileHookMaxHeight !== null) {
            setMobileHookMaxHeight(null);
            return;
        }

        const computedStyle = window.getComputedStyle(cardElement);
        const verticalPadding =
            Number.parseFloat(computedStyle.paddingTop) + Number.parseFloat(computedStyle.paddingBottom);
        const availableContentHeight = getMobileAvailableContentHeight({
            mobileCardTargetHeight,
            verticalPadding,
        });
        const requiredContentHeight = Math.ceil(cardContentElement.scrollHeight);
        const cardFits = requiredContentHeight <= availableContentHeight;

        if (cardFits) {
            return;
        }

        const hookBodyElement = hookBodyRef.current;
        if (!hookBodyElement) {
            return;
        }

        const currentHookHeight = Math.ceil(hookBodyElement.getBoundingClientRect().height);
        const nextHookMaxHeight = getMobileHookMaxHeight({
            availableContentHeight,
            requiredContentHeight,
            currentHookHeight,
        });

        if (nextHookMaxHeight === null || mobileHookMaxHeight === nextHookMaxHeight) {
            return;
        }

        setMobileHookMaxHeight(nextHookMaxHeight);
    }, [
        card.id,
        cardWidth,
        isFocusDesktop,
        mobileCardTargetHeight,
        mobileHookMaxHeight,
    ]);

    useLayoutEffect(() => {
        if (!isFocusDesktop || !desktopFitKey || mobileCardTargetHeight === null) {
            return;
        }

        const cardElement = cardRef.current;
        const cardContentElement = cardContentRef.current;
        if (!cardElement || !cardContentElement) {
            return;
        }

        const computedStyle = window.getComputedStyle(cardElement);
        const verticalPadding =
            Number.parseFloat(computedStyle.paddingTop) + Number.parseFloat(computedStyle.paddingBottom);
        const availableContentHeight = Math.max(mobileCardTargetHeight - verticalPadding - 8, 0);
        const requiredContentHeight = Math.ceil(cardContentElement.scrollHeight);

        if (
            requiredContentHeight <= availableContentHeight + 1
            || desktopCompactLevel >= MAX_DESKTOP_COMPACT_LEVEL
        ) {
            return;
        }

        setMeasuredDesktopCompactLevel({
            key: desktopFitKey,
            level: Math.min(
                desktopCompactLevel + 1,
                MAX_DESKTOP_COMPACT_LEVEL
            ) as DesktopCompactLevel,
        });
    }, [
        desktopCompactLevel,
        desktopFitKey,
        isFocusDesktop,
        mobileCardTargetHeight,
    ]);

    return (
        <article
            data-focus-card-index={cardIndex}
            data-testid="focus-feed-card"
            ref={cardRef}
            className={`${FEED_CARD_HEIGHT_CLASS} relative snap-start overflow-hidden rounded-[2rem] border border-border/60 bg-card/70 px-5 py-4 shadow-sm backdrop-blur sm:px-6 sm:py-5`}
        >
            <div ref={cardContentRef} data-testid="focus-card-content" className="flex h-full min-h-0 flex-col">
                {isFocusDesktop ? (
                    <div className={`flex h-full min-h-0 flex-col ${desktopCompactClasses.layoutGap}`}>
                        <div className={`shrink-0 ${desktopCompactClasses.headerSpacing} text-center`}>
                            <div className="flex justify-center">
                                <div className="relative">
                                    <div className="pointer-events-none absolute inset-[-1.1rem] rounded-[2rem] bg-primary/8 blur-2xl" aria-hidden="true" />
                                    {card.cover_image_url ? (
                                        <div
                                            className="relative aspect-[2/3] overflow-hidden rounded-[1.35rem] border border-white/10 bg-secondary/50 shadow-[0_22px_50px_-24px_rgba(0,0,0,0.85)]"
                                            style={{ width: `${desktopCoverWidth}px` }}
                                        >
                                            <ResilientImage
                                                src={card.cover_image_url}
                                                alt={card.title}
                                                fill
                                                sizes={`${desktopCoverWidth}px`}
                                                surface="content-preview"
                                                className="object-cover"
                                                fallback={
                                                    <div className="absolute inset-0 flex items-center justify-center bg-gradient-to-br from-secondary via-card to-background">
                                                        <BookOpen className="size-10 text-muted-foreground" />
                                                    </div>
                                                }
                                            />
                                        </div>
                                    ) : (
                                        <div
                                            className="relative flex aspect-[2/3] items-center justify-center rounded-[1.35rem] border border-white/10 bg-gradient-to-br from-secondary via-card to-background shadow-[0_22px_50px_-24px_rgba(0,0,0,0.85)]"
                                            style={{ width: `${desktopCoverWidth}px` }}
                                        >
                                            <BookOpen className="size-10 text-muted-foreground" />
                                        </div>
                                    )}
                                </div>
                            </div>

                            <div className="space-y-1.5">
                                <h2 className={`mx-auto max-w-[34rem] text-[1.2rem] font-semibold leading-[1.1] tracking-tight text-foreground sm:text-[1.5rem] sm:leading-[1.1] ${desktopCompactClasses.titleClamp}`}>
                                    {card.title}
                                </h2>
                                <div className={desktopCompactClasses.metadataSpacing}>
                                    {card.author && (
                                        <p className="line-clamp-1 text-[0.9rem] font-medium text-muted-foreground/80">
                                            {card.author}
                                        </p>
                                    )}
                                    <div className="flex flex-wrap items-center justify-center gap-1.5 sm:gap-2">
                                        <span className="inline-flex items-center rounded-full border border-border/50 bg-secondary/60 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                                            {card.type}
                                        </span>
                                        {card.category && (
                                            <span className="inline-flex items-center rounded-full border border-border/50 bg-secondary/60 px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
                                                {card.category}
                                            </span>
                                        )}
                                        {duration && (
                                            <span className="inline-flex items-center rounded-full border border-border/50 bg-secondary/60 px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
                                                {duration}
                                            </span>
                                        )}
                                    </div>
                                    <div className="flex items-center justify-center gap-2 pt-1">
                                        <LibrarySaveButton
                                            contentTitle={card.title}
                                            isSaved={isSaved}
                                            onToggle={() => {
                                                onToggleSave(card);
                                            }}
                                            className="focus-ring inline-flex h-9 w-9 items-center justify-center rounded-full border transition-colors touch-manipulation"
                                            savedClassName="border-primary/30 bg-primary/10 text-primary"
                                            unsavedClassName="border-border/45 bg-secondary/20 text-muted-foreground/80 hover:bg-secondary/40 hover:text-foreground"
                                            iconClassName="size-4"
                                        />
                                        <ShareButton
                                            path={`/preview/${card.id}`}
                                            title={card.title}
                                            text={`Check out "${card.title}" on Netflux`}
                                            variant="icon"
                                            source="focus_feed"
                                            contentId={card.id}
                                            contentType={card.type}
                                            className="focus-ring h-9 w-9 rounded-full border border-border/45 bg-secondary/20 p-0 text-muted-foreground/80 hover:bg-secondary/40 hover:text-foreground"
                                        />
                                    </div>
                                </div>
                            </div>
                        </div>

                        <section className={`relative shrink-0 rounded-r-2xl border-l-[3px] border-primary/45 bg-secondary/25 ${desktopCompactClasses.hookPadding}`}>
                            <p className={`text-[1.05rem] leading-[1.58] text-foreground/92 ${desktopCompactClasses.hookClamp}`}>
                                {card.hook}
                            </p>
                        </section>

                        {shouldShowDesktopTakeaways && desktopTakeawayClasses ? (
                            <section className={`flex min-h-0 flex-1 flex-col ${desktopTakeawayClasses.contentSpacing}`}>
                                <p className="px-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground/75">
                                    {desktopTakeawaysHeading}
                                </p>
                                {desktopVisibleTakeaways.length > 0 ? (
                                    <div
                                        data-testid="focus-desktop-takeaways-list"
                                        className="min-h-0 overflow-hidden pr-1"
                                        aria-label={`${card.title} key takeaways`}
                                    >
                                        <div className={`grid ${desktopTakeawayClasses.takeawayGap}`}>
                                            {desktopVisibleTakeaways.map((takeaway, index) => (
                                                <div
                                                    key={`${card.id}-${index}`}
                                                    data-focus-desktop-takeaway-row
                                                    className="flex gap-3 px-1 py-0.5"
                                                >
                                                    <span className="mt-0.5 flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-lg bg-primary/10 text-[10px] font-bold text-primary">
                                                        {index + 1}
                                                    </span>
                                                    <span className={`min-w-0 text-[1rem] leading-[1.58] text-foreground/90 ${desktopTakeawayClasses.takeawayClamp}`}>
                                                        {takeaway}
                                                    </span>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                ) : (
                                    <p className="px-1 text-[1rem] leading-[1.6] text-muted-foreground">
                                        Open the full summary for the complete breakdown.
                                    </p>
                                )}
                            </section>
                        ) : null}

                        <div className={`flex flex-wrap items-center justify-start ${desktopCompactClasses.actionsSpacing}`}>
                            {isDesktopTakeawaysTruncated ? (
                                <Link
                                    href={`/preview/${card.id}?takeaways=all`}
                                    className="focus-ring inline-flex items-center justify-center gap-2 rounded-full border border-border/70 bg-card/50 px-4 py-2.5 text-sm font-medium text-foreground transition-colors hover:bg-secondary/50"
                                    aria-label={`Preview ${card.title}`}
                                >
                                    <Info className="size-4" />
                                    Preview Takeaways
                                </Link>
                            ) : null}
                            <Link
                                href={buildReadPath(card)}
                                className="focus-ring inline-flex items-center justify-center gap-2 rounded-full bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
                                aria-label={`Read ${card.title}`}
                            >
                                <BookOpen className="size-4" />
                                Read Summary
                            </Link>
                        </div>
                    </div>
                ) : (
                    <div className={isCompactMobileLayout ? "space-y-2.5" : "space-y-3"}>
                        <div className="flex flex-col items-center text-center">
                            <div className="relative">
                                <div className="pointer-events-none absolute inset-[-1.1rem] rounded-[2rem] bg-primary/8 blur-2xl" aria-hidden="true" />
                                {card.cover_image_url ? (
                                    <div className={`relative aspect-[2/3] overflow-hidden rounded-[1.35rem] border border-white/10 bg-secondary/50 shadow-[0_22px_50px_-24px_rgba(0,0,0,0.85)] ${isCompactMobileLayout ? "w-[112px] sm:w-[124px]" : "w-[128px] sm:w-[140px]"}`}>
                                        <ResilientImage
                                            src={card.cover_image_url}
                                            alt={card.title}
                                            fill
                                            sizes={isCompactMobileLayout ? "(max-width: 640px) 112px, 124px" : "(max-width: 640px) 128px, 140px"}
                                            surface="content-preview"
                                            className="object-cover"
                                            fallback={
                                                <div className="absolute inset-0 flex items-center justify-center bg-gradient-to-br from-secondary via-card to-background">
                                                    <BookOpen className="size-10 text-muted-foreground" />
                                                </div>
                                            }
                                        />
                                    </div>
                                ) : (
                                    <div className={`relative flex aspect-[2/3] items-center justify-center rounded-[1.35rem] border border-white/10 bg-gradient-to-br from-secondary via-card to-background shadow-[0_22px_50px_-24px_rgba(0,0,0,0.85)] ${isCompactMobileLayout ? "w-[112px] sm:w-[124px]" : "w-[128px] sm:w-[140px]"}`}>
                                        <BookOpen className="size-10 text-muted-foreground" />
                                    </div>
                                )}
                            </div>
                        </div>

                        <div className={`${isCompactMobileLayout ? "space-y-2.5" : "space-y-3"} text-center`}>
                            <h2 className={`mx-auto max-w-[22rem] font-semibold leading-[1.12] tracking-tight text-foreground sm:max-w-[30rem] sm:leading-[1.1] ${isCompactMobileLayout ? "text-[1.18rem] sm:text-[1.45rem]" : "text-[1.32rem] sm:text-[1.6rem]"}`}>
                                {card.title}
                            </h2>
                            <div className="space-y-1">
                                {card.author && (
                                    <p className={`line-clamp-1 font-medium text-muted-foreground/80 ${isCompactMobileLayout ? "text-[0.95rem] sm:text-base" : "text-base sm:text-[1.0625rem]"}`}>
                                        {card.author}
                                    </p>
                                )}
                                <div className={`flex flex-wrap items-center justify-center ${isCompactMobileLayout ? "gap-1 sm:gap-1.5" : "gap-1.5 sm:gap-2"}`}>
                                    <span className={`inline-flex items-center rounded-full border border-border/50 bg-secondary/60 font-semibold uppercase tracking-wider text-muted-foreground ${isCompactMobileLayout ? "px-2 py-0.5 text-[11px] sm:text-xs" : "px-2.5 py-1 text-xs sm:text-[0.8rem]"}`}>
                                        {card.type}
                                    </span>
                                    {card.category && (
                                        <span className={`inline-flex items-center rounded-full border border-border/50 bg-secondary/60 font-medium text-muted-foreground ${isCompactMobileLayout ? "px-2 py-0.5 text-[11px] sm:text-xs" : "px-2.5 py-1 text-xs sm:text-[0.8rem]"}`}>
                                            {card.category}
                                        </span>
                                    )}
                                    {duration && (
                                        <span className={`inline-flex items-center rounded-full border border-border/50 bg-secondary/60 font-medium text-muted-foreground ${isCompactMobileLayout ? "px-2 py-0.5 text-[11px] sm:text-xs" : "px-2.5 py-1 text-xs sm:text-[0.8rem]"}`}>
                                            {duration}
                                        </span>
                                    )}
                                </div>
                                <div className={`flex items-center justify-center pt-0 ${isCompactMobileLayout ? "gap-2.5" : "gap-3"}`}>
                                    <LibrarySaveButton
                                        contentTitle={card.title}
                                        isSaved={isSaved}
                                        onToggle={() => {
                                            onToggleSave(card);
                                        }}
                                        className="focus-ring inline-flex h-9 w-9 items-center justify-center rounded-full transition-colors touch-manipulation"
                                        savedClassName="bg-primary/10 text-primary"
                                        unsavedClassName="text-muted-foreground/75 hover:bg-secondary/40 hover:text-foreground"
                                        iconClassName="size-4"
                                    />
                                    <ShareButton
                                        path={`/preview/${card.id}`}
                                        title={card.title}
                                        text={`Check out "${card.title}" on Netflux`}
                                        variant="icon"
                                        source="focus_feed"
                                        contentId={card.id}
                                        contentType={card.type}
                                        className="focus-ring h-9 w-9 rounded-full p-0 text-muted-foreground/75 hover:bg-secondary/40 hover:text-foreground"
                                    />
                                </div>
                            </div>
                        </div>

                        <section className={`relative rounded-[1.4rem] border border-border/35 bg-secondary/20 text-left shadow-[inset_0_1px_0_rgba(255,255,255,0.03)] sm:px-5 ${isCompactMobileLayout ? "px-4 py-3" : "px-4 py-4"}`}>
                            <div
                                ref={hookBodyRef}
                                data-testid="focus-mobile-hook-body"
                                className="overflow-hidden"
                                style={mobileHookMaxHeight !== null ? { maxHeight: `${mobileHookMaxHeight}px` } : undefined}
                            >
                                <p className={`text-foreground/92 ${isCompactMobileLayout ? "text-base leading-[1.58] sm:text-[1.05rem]" : "text-[1.0625rem] leading-[1.62] sm:text-[1.1rem]"}`}>
                                    {card.hook}
                                </p>
                            </div>
                        </section>

                        <div className={`flex flex-col items-center pt-0.5 ${isCompactMobileLayout ? "gap-1.5" : "gap-2"}`}>
                            <button
                                type="button"
                                data-testid="focus-takeaways-opener"
                                onClick={(event) => onOpenTakeaways(card, event.currentTarget)}
                                className="focus-ring inline-flex min-h-11 items-center justify-center gap-2 rounded-full bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 touch-manipulation"
                                aria-label={`Preview ${card.title}`}
                            >
                                <Info className="size-4" />
                                Preview Takeaways
                            </button>
                        </div>
                    </div>
                )}
            </div>
            {isFocusDesktop && isActive && showDesktopScrollCue && desktopCompactLevel < MAX_DESKTOP_COMPACT_LEVEL ? (
                <div className="pointer-events-none absolute inset-x-0 bottom-5 flex justify-center">
                    <div
                        data-testid="focus-navigation-cue"
                        className="focus-scroll-cue inline-flex items-center gap-1.5 rounded-full border border-border/70 bg-background/80 px-3 py-1.5 text-[11px] font-medium tracking-[0.12em] text-muted-foreground shadow-sm backdrop-blur-md"
                    >
                        <span>Scroll for next</span>
                        <ChevronDown className="size-3.5" aria-hidden="true" />
                    </div>
                </div>
            ) : null}
        </article>
    );
});
