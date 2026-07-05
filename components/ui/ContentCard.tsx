"use client";

import Link from "next/link";
import {
    BookOpen,
    Headphones,
    FileText,
    CheckCircle2,
    Trash2,
    Bookmark,
    Video,
    Archive,
} from "lucide-react";
import type { ContentItem } from "@/types/database";
import { useReadingProgress } from "@/hooks/useReadingProgress";
import { cn } from "@/lib/utils";
import { buildReadPath } from "@/lib/content-paths";
import { toast } from "sonner";
import { ResilientImage } from "@/components/ui/ResilientImage";
import {
    CONTENT_CARD_ASPECT_CLASS,
    CONTENT_CARD_IMAGE_SIZES,
} from "@/components/ui/content-card-standards";

interface ContentCardProps {
    item: ContentItem;
    showCompletedBadge?: boolean;
    onRemove?: (id: string) => void;
    removeLabel?: string;
    removeIcon?: "archive" | "trash";
    onSecondaryRemove?: (id: string) => void;
    secondaryRemoveLabel?: string;
    secondaryRemoveIcon?: "archive" | "trash";
    hideProgressBar?: boolean;
    hideBookmark?: boolean;
    enableUserState?: boolean;
    navigationMode?: "preview" | "resume";
    titleDensity?: "default" | "app-compact";
    priority?: boolean;
}

interface BaseContentCardProps extends ContentCardProps {
    isBookmarked?: boolean;
    progressPercentage?: number;
    showProgress?: boolean;
    onToggleBookmark?: (event: React.MouseEvent<HTMLButtonElement>) => void;
    href?: string;
}

function hasUsableProgress(progress: ReturnType<typeof useReadingProgress>["getProgress"] extends (itemId: string) => infer T ? T : never) {
    if (!progress) {
        return false;
    }

    return (
        Array.isArray(progress.completed)
        || typeof progress.maxSegmentIndex === "number"
        || typeof progress.lastSegmentIndex === "number"
        || typeof progress.lastReadAt === "string"
    );
}

function getContentCardHref(item: ContentItem, navigationMode: "preview" | "resume", hasProgress: boolean) {
    if (navigationMode === "resume" && hasProgress) {
        return buildReadPath(item);
    }

    return `/preview/${item.id}`;
}

function getContentCardLabel(href: string, title: string, hasAudioSummary: boolean) {
    const baseLabel = href.startsWith("/read/") ? `Read ${title}` : `Preview ${title}`;
    return hasAudioSummary ? `${baseLabel}. Audio summary available.` : baseLabel;
}

function getContentCardHook(item: ContentItem) {
    const quickMode = item.quick_mode_json;
    if (!quickMode || typeof quickMode !== "object" || Array.isArray(quickMode)) {
        return null;
    }

    const hook = (quickMode as { hook?: unknown }).hook;
    if (typeof hook !== "string") {
        return null;
    }

    return hook.trim() || null;
}

export function ContentCard({
    enableUserState = true,
    ...props
}: ContentCardProps) {
    if (!enableUserState) {
        return <BaseContentCard {...props} />;
    }

    return <InteractiveContentCard {...props} />;
}

function InteractiveContentCard(props: ContentCardProps) {
    const { item, hideProgressBar = false, navigationMode = "preview" } = props;
    const { isInMyList, toggleMyList, getProgress } = useReadingProgress();
    const isBookmarked = isInMyList(item.id);
    const progress = getProgress(item.id);
    const href = getContentCardHref(item, navigationMode, hasUsableProgress(progress));

    const percentage =
        progress && progress.totalSegments
            ? Math.min(
                100,
                Math.round((progress.completed?.length || 0) / progress.totalSegments * 100)
            )
            : 0;

    const showProgress = !hideProgressBar && !!progress && !progress.isCompleted && percentage > 0;

    return (
        <BaseContentCard
            {...props}
            isBookmarked={isBookmarked}
            progressPercentage={percentage}
            showProgress={showProgress}
            href={href}
            onToggleBookmark={(event) => {
                event.preventDefault();
                event.stopPropagation();

                toggleMyList(item.id);
                toast.success(isBookmarked ? "Removed from Library" : "Saved to Library");
            }}
        />
    );
}

function BaseContentCard({
    item,
    showCompletedBadge = false,
    onRemove,
    removeLabel = "Remove from list",
    removeIcon = "trash",
    onSecondaryRemove,
    secondaryRemoveLabel = "Remove from history",
    secondaryRemoveIcon = "trash",
    hideBookmark = false,
    isBookmarked = false,
    progressPercentage = 0,
    showProgress = false,
    onToggleBookmark,
    href = `/preview/${item.id}`,
    titleDensity = "default",
    priority = false,
}: BaseContentCardProps) {
    const typeIcon: Record<ContentItem["type"], React.ComponentType<{ className?: string }>> = {
        podcast: Headphones,
        book: BookOpen,
        article: FileText,
        video: Video,
    };
    const Icon = typeIcon[item.type] || BookOpen;
    const RemoveIcon = removeIcon === "archive" ? Archive : Trash2;
    const SecondaryRemoveIcon = secondaryRemoveIcon === "archive" ? Archive : Trash2;

    const createdAt = item.created_at ? new Date(item.created_at) : null;
    const isNew = createdAt ? createdAt > new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) : false;
    const renderNewBadge = isNew && !showCompletedBadge;
    const hasAudioSummary = Boolean(item.audio_url?.trim());
    const linkLabel = getContentCardLabel(href, item.title, hasAudioSummary);
    const bookmarkLabel = isBookmarked
        ? `Remove ${item.title} from Library`
        : `Save ${item.title} to Library`;
    const showBookmarkButton = !hideBookmark && Boolean(onToggleBookmark);
    const contentHook = getContentCardHook(item);
    const isAppCompact = titleDensity === "app-compact";

    return (
        <div className={cn(
            "content-card-motion-surface group relative block w-full overflow-hidden rounded-md bg-card ring-1 ring-transparent transition-[transform,box-shadow] duration-300 md:hover:z-10 md:hover:-translate-y-1 md:hover:ring-white/15 md:hover:shadow-[0_14px_32px_rgba(0,0,0,0.42)] md:group-focus-within:z-10 md:group-focus-within:-translate-y-1 md:group-focus-within:ring-white/15 md:group-focus-within:shadow-[0_14px_32px_rgba(0,0,0,0.42)] motion-reduce:transition-none",
            CONTENT_CARD_ASPECT_CLASS
        )}>
            <Link href={href} className="absolute inset-0 z-10 rounded-md focus-ring">
                <span className="sr-only">{linkLabel}</span>
            </Link>

            {item.cover_image_url ? (
                <div className="absolute inset-0 h-full w-full">
                    <ResilientImage
                        src={item.cover_image_url}
                        alt={item.title}
                        fill
                        surface="content-card"
                        className="content-card-motion-image object-cover transition-transform duration-300 md:group-hover:scale-[1.035] md:group-focus-within:scale-[1.035] motion-reduce:transition-none"
                        sizes={CONTENT_CARD_IMAGE_SIZES}
                        priority={priority}
                        fallback={
                            <div className="absolute inset-0 flex h-full w-full items-center justify-center bg-gradient-to-br from-muted via-card to-background">
                                <Icon className="size-16 text-muted-foreground" />
                            </div>
                        }
                    />
                </div>
            ) : (
                <div className="absolute inset-0 flex h-full w-full items-center justify-center bg-gradient-to-br from-muted via-card to-background">
                    <Icon className="size-16 text-muted-foreground" />
                </div>
            )}

            {renderNewBadge ? (
                <div className="pointer-events-none absolute left-2 top-2 z-20 rounded-sm border border-white/10 bg-rose-600/90 px-1.5 py-0.5 text-[9px] font-bold tracking-[0.14em] text-white shadow-sm backdrop-blur-md md:px-2 md:text-[10px] md:tracking-wider">
                    NEW
                </div>
            ) : null}

            {showCompletedBadge ? (
                <div className="pointer-events-none absolute right-2 top-2 z-20 rounded-full bg-emerald-500 p-1.5 shadow-lg">
                    <CheckCircle2 className="size-4 text-white" />
                </div>
            ) : null}

            {showBookmarkButton ? (
                <button
                    onClick={onToggleBookmark}
                    className={cn(
                        "content-card-motion-action focus-ring absolute top-2 z-20 rounded-full p-1.5 shadow-lg backdrop-blur-sm transition-all duration-300 motion-reduce:transition-none",
                        showCompletedBadge ? "right-10" : "right-2",
                        isBookmarked
                            ? "bg-primary text-primary-foreground opacity-100"
                            : "content-card-hover-action bg-black/40 text-white/85 opacity-100 hover:bg-black/70 hover:text-white"
                    )}
                    title={isBookmarked ? "Remove from Library" : "Save to Library"}
                    aria-label={bookmarkLabel}
                >
                    {isBookmarked ? (
                        <Bookmark className="size-5" fill="currentColor" />
                    ) : (
                        <Bookmark className="size-[18px]" />
                    )}
                </button>
            ) : null}

            {item.author ? (
                <div className="pointer-events-none absolute inset-x-0 top-0 z-30 flex justify-center bg-gradient-to-b from-black/80 via-black/35 to-transparent px-5 pb-5 pt-5 md:px-8 md:pb-8 md:pt-10">
                    <p
                        className={cn(
                            "translate-z-0 max-w-[82%] break-words text-center font-medium uppercase leading-relaxed tracking-[0.1em] whitespace-normal text-white/80 drop-shadow-md md:text-[11px] md:tracking-[0.15em]",
                            "text-[9px]"
                        )}
                    >
                        {item.author}
                    </p>
                </div>
            ) : null}

            <div className="content-card-motion-overlay pointer-events-none absolute inset-0 rounded-md bg-black/40 opacity-0 transition-opacity duration-300 md:group-hover:opacity-100 md:group-focus-within:opacity-100 motion-reduce:transition-none" />

            <div className="pointer-events-none absolute inset-x-0 bottom-0 z-30 bg-gradient-to-t from-black/95 via-black/72 to-transparent px-3.5 pb-3.5 pt-14 md:p-4 md:pb-5 md:pt-20">
                <div className="flex h-full flex-col justify-end gap-1">
                    {contentHook ? (
                        <p
                            aria-hidden="true"
                            className="content-card-motion-hook hidden w-full translate-y-1 text-[10px] font-medium leading-snug text-white/76 opacity-0 drop-shadow-md transition-[opacity,transform] duration-300 md:mb-1 md:line-clamp-2 md:block md:group-hover:translate-y-0 md:group-hover:opacity-100 md:group-focus-within:translate-y-0 md:group-focus-within:opacity-100 lg:text-[11px] motion-reduce:transition-none"
                        >
                            {contentHook}
                        </p>
                    ) : null}

                    <h3
                        className={cn(
                            "w-full line-clamp-3 font-serif font-medium text-white/95 transition-colors group-hover:text-white md:text-base md:leading-snug",
                            isAppCompact
                                ? "text-[0.92rem] leading-[1.16]"
                                : "text-[0.95rem] leading-[1.18]"
                        )}
                    >
                        {item.title}
                    </h3>

                    <div
                        className="w-full max-h-14 space-y-0.5 overflow-hidden md:max-h-12"
                    >
                        {item.category ? (
                            <p
                                className={cn(
                                    "line-clamp-1 font-medium uppercase leading-relaxed tracking-[0.1em] text-white/70 drop-shadow-md md:text-[10px] md:tracking-widest",
                                    "text-[9px]"
                                )}
                            >
                                {item.category}
                            </p>
                        ) : null}
                        <p
                            className={cn(
                                "flex w-full flex-wrap items-center gap-x-1 gap-y-0.5 font-medium uppercase leading-relaxed tracking-[0.1em] text-white/62 drop-shadow-md md:gap-x-1.5 md:text-[10px] md:tracking-widest",
                                "text-[9px]"
                            )}
                        >
                            <span>{item.type}</span>
                            {item.duration_seconds ? (
                                <span className="flex items-center gap-1.5 whitespace-nowrap">
                                    <span className="opacity-40">•</span>
                                    <span>
                                        {Math.round(item.duration_seconds / 60) < 60
                                            ? `${Math.round(item.duration_seconds / 60)} min`
                                            : `${Math.floor(Math.round(item.duration_seconds / 60) / 60)}h ${Math.round(item.duration_seconds / 60) % 60 > 0
                                                ? `${Math.round(item.duration_seconds / 60) % 60}m`
                                                : ""
                                            }`}
                                    </span>
                                </span>
                            ) : null}
                            {hasAudioSummary ? (
                                <span className="flex items-center gap-1.5 whitespace-nowrap">
                                    <span className="opacity-40">•</span>
                                    <Headphones className="size-3 text-white/70" aria-hidden="true" />
                                    <span className="sr-only">Audio summary available</span>
                                </span>
                            ) : null}
                        </p>
                    </div>
                </div>
            </div>

            {showProgress ? (
                <div className="absolute inset-x-px bottom-px z-40 h-1.5 rounded-b-[5px] bg-black/40 backdrop-blur-sm">
                    <div
                        className="content-card-motion-progress h-full rounded-b-[5px] bg-white shadow-[0_0_8px_rgba(255,255,255,0.8)] transition-all duration-300 motion-reduce:transition-none"
                        style={{ width: `${progressPercentage}%` }}
                    />
                </div>
            ) : null}

            {onRemove ? (
                <button
                    onClick={(event) => {
                        event.preventDefault();
                        event.stopPropagation();
                        onRemove(item.id);
                    }}
                    className={cn(
                        "content-card-hover-action focus-ring absolute left-2 top-2 z-20 rounded-full bg-black/50 p-1.5 opacity-100 backdrop-blur-sm transition-all duration-300 motion-reduce:transition-none",
                        removeIcon === "archive" ? "hover:bg-white/20" : "hover:bg-red-500/80",
                    )}
                    title={removeLabel}
                    aria-label={removeLabel}
                >
                    <RemoveIcon className="size-4 text-white" />
                </button>
            ) : null}

            {onSecondaryRemove ? (
                <button
                    onClick={(event) => {
                        event.preventDefault();
                        event.stopPropagation();
                        onSecondaryRemove(item.id);
                    }}
                    className={cn(
                        "content-card-hover-action focus-ring absolute left-10 top-2 z-20 rounded-full bg-black/50 p-1.5 opacity-100 backdrop-blur-sm transition-all duration-300 motion-reduce:transition-none",
                        secondaryRemoveIcon === "archive" ? "hover:bg-white/20" : "hover:bg-red-500/80",
                    )}
                    title={secondaryRemoveLabel}
                    aria-label={secondaryRemoveLabel}
                >
                    <SecondaryRemoveIcon className="size-4 text-white" />
                </button>
            ) : null}

            <div className="content-card-motion-border pointer-events-none absolute inset-0 z-30 rounded-md border border-white/15 transition-colors motion-reduce:transition-none" />
            <div className="content-card-motion-border pointer-events-none absolute inset-0 z-30 rounded-md border-2 border-transparent transition-colors group-hover:border-primary/75 motion-reduce:transition-none" />
        </div>
    );
}
