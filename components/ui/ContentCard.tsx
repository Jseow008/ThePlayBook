"use client";

import Link from "next/link";
import Image from "next/image";
import {
    BookOpen,
    Headphones,
    FileText,
    CheckCircle2,
    Trash2,
    Bookmark,
    Video,
} from "lucide-react";
import type { ContentItem } from "@/types/database";
import { useReadingProgress } from "@/hooks/useReadingProgress";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

interface ContentCardProps {
    item: ContentItem;
    showCompletedBadge?: boolean;
    onRemove?: (id: string) => void;
    hideProgressBar?: boolean;
    hideBookmark?: boolean;
    enableUserState?: boolean;
}

interface BaseContentCardProps extends ContentCardProps {
    isBookmarked?: boolean;
    progressPercentage?: number;
    showProgress?: boolean;
    onToggleBookmark?: (event: React.MouseEvent<HTMLButtonElement>) => void;
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
    const { item, hideProgressBar = false } = props;
    const { isInMyList, toggleMyList, getProgress } = useReadingProgress();
    const isBookmarked = isInMyList(item.id);
    const progress = getProgress(item.id);

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
            onToggleBookmark={(event) => {
                event.preventDefault();
                event.stopPropagation();

                toggleMyList(item.id);
                toast.success(isBookmarked ? "Removed from My List" : "Added to My List");
            }}
        />
    );
}

function BaseContentCard({
    item,
    showCompletedBadge = false,
    onRemove,
    hideBookmark = false,
    isBookmarked = false,
    progressPercentage = 0,
    showProgress = false,
    onToggleBookmark,
}: BaseContentCardProps) {
    const typeIcon: Record<ContentItem["type"], React.ComponentType<{ className?: string }>> = {
        podcast: Headphones,
        book: BookOpen,
        article: FileText,
        video: Video,
    };
    const Icon = typeIcon[item.type] || BookOpen;

    const createdAt = item.created_at ? new Date(item.created_at) : null;
    const isNew = createdAt ? createdAt > new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) : false;
    const renderNewBadge = isNew && !showCompletedBadge;

    return (
        <div className="group relative block aspect-[2/3] w-full overflow-hidden rounded-md bg-card transition-transform duration-300 hover:z-10 hover:scale-105">
            <Link href={`/preview/${item.id}`} className="absolute inset-0 z-10 rounded-md focus-ring">
                <span className="sr-only">View {item.title}</span>
            </Link>

            {item.cover_image_url ? (
                <div className="absolute inset-0 h-full w-full">
                    <Image
                        src={item.cover_image_url}
                        alt={item.title}
                        fill
                        className="object-cover transition-transform duration-300 group-hover:scale-110"
                        sizes="(max-width: 768px) 50vw, (max-width: 1200px) 33vw, 20vw"
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

            {!hideBookmark ? (
                <button
                    onClick={onToggleBookmark}
                    className={cn(
                        "focus-ring absolute top-2 z-20 rounded-full p-1.5 shadow-lg backdrop-blur-sm transition-all duration-300",
                        showCompletedBadge ? "right-10" : "right-2",
                        isBookmarked
                            ? "bg-primary text-primary-foreground opacity-100"
                            : "bg-black/40 text-white opacity-100 hover:bg-black/70 lg:opacity-0 lg:group-hover:opacity-100"
                    )}
                    title={isBookmarked ? "Remove from My List" : "Add to My List"}
                    aria-label={isBookmarked ? "Remove from My List" : "Add to My List"}
                >
                    {isBookmarked ? (
                        <Bookmark className="size-5" fill="currentColor" />
                    ) : (
                        <Bookmark className="size-5" />
                    )}
                </button>
            ) : null}

            {item.author ? (
                <div className="pointer-events-none absolute inset-x-0 top-0 z-30 flex justify-center bg-gradient-to-b from-black/80 via-black/35 to-transparent px-5 pb-5 pt-5 md:px-8 md:pb-8 md:pt-10">
                    <p className="translate-z-0 break-words text-center text-[9px] font-medium uppercase leading-relaxed tracking-[0.12em] whitespace-normal text-white/90 drop-shadow-md md:text-[11px] md:tracking-[0.15em]">
                        {item.author}
                    </p>
                </div>
            ) : null}

            <div className="pointer-events-none absolute inset-0 rounded-md bg-black/30 opacity-0 transition-opacity duration-300 group-hover:opacity-100" />

            <div className="pointer-events-none absolute inset-x-0 bottom-0 z-30 bg-gradient-to-t from-black/95 via-black/72 to-transparent px-3.5 pb-3.5 pt-14 md:p-4 md:pb-5 md:pt-20">
                <div className="flex h-full flex-col justify-end gap-1">
                    <h3 className="w-full line-clamp-3 font-serif text-[0.95rem] font-medium leading-[1.18] text-white/95 transition-colors group-hover:text-white md:text-base md:leading-snug">
                        {item.title}
                    </h3>

                    <div className="w-full">
                        <p className="flex w-full flex-wrap items-center gap-x-1 gap-y-0.5 text-[9px] font-medium uppercase leading-relaxed tracking-[0.1em] text-white/70 drop-shadow-md md:gap-x-1.5 md:text-[10px] md:tracking-widest">
                            <span>{item.type}</span>
                            {item.category ? (
                                <span className="flex items-center gap-1.5">
                                    <span className="opacity-40">•</span>
                                    <span>{item.category}</span>
                                </span>
                            ) : null}
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
                        </p>
                    </div>
                </div>
            </div>

            {showProgress ? (
                <div className="absolute inset-x-px bottom-px z-40 h-1.5 rounded-b-[5px] bg-black/40 backdrop-blur-sm">
                    <div
                        className="h-full rounded-b-[5px] bg-white shadow-[0_0_8px_rgba(255,255,255,0.8)] transition-all duration-300"
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
                    className="focus-ring absolute left-2 top-2 z-20 rounded-full bg-black/50 p-1.5 opacity-100 backdrop-blur-sm transition-all duration-300 hover:bg-red-500/80 lg:opacity-0 lg:group-hover:opacity-100"
                    title="Remove from progress"
                    aria-label="Remove from progress"
                >
                    <Trash2 className="size-4 text-white" />
                </button>
            ) : null}

            <div className="pointer-events-none absolute inset-0 z-30 rounded-md border border-white/15 transition-colors" />
            <div className="pointer-events-none absolute inset-0 z-30 rounded-md border-2 border-transparent transition-colors group-hover:border-primary/75" />
        </div>
    );
}
