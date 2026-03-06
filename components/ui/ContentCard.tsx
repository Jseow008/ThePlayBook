"use client";

import Link from "next/link";
import Image from "next/image";
import { BookOpen, Headphones, FileText, CheckCircle2, Trash2, Bookmark, Video } from "lucide-react";
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
}

export function ContentCard({
    item,
    showCompletedBadge = false,
    onRemove,
    hideProgressBar = false,
    hideBookmark = false
}: ContentCardProps) {
    const { isInMyList, toggleMyList, getProgress } = useReadingProgress();
    const isBookmarked = isInMyList(item.id);
    const progress = getProgress(item.id);

    const typeIcon: Record<ContentItem["type"], any> = {
        podcast: Headphones,
        book: BookOpen,
        article: FileText,
        video: Video,
    };
    const Icon = typeIcon[item.type] || BookOpen;

    // Calculate Progress Percentage
    const percentage = progress && progress.totalSegments
        ? Math.min(100, Math.round((((progress.maxSegmentIndex ?? progress.lastSegmentIndex) + 1) / progress.totalSegments) * 100))
        : 0;

    // Only show progress bar if started, not completed, and has valid percentage
    const showProgress = !hideProgressBar && progress && !progress.isCompleted && percentage > 0;

    // Calculate if the item is considered "NEW"
    const isNew = new Date(item.created_at) > new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const renderNewBadge = isNew && !showCompletedBadge;

    return (
        <div className="group relative block aspect-[2/3] w-full bg-card rounded-md overflow-hidden transition-transform duration-300 hover:scale-105 hover:z-10">
            {/* Main Link Overlay */}
            <Link href={`/preview/${item.id}`} className="absolute inset-0 z-10 focus-ring rounded-md">
                <span className="sr-only">View {item.title}</span>
            </Link>

            {/* Background */}
            {item.cover_image_url ? (
                <div className="absolute inset-0 w-full h-full">
                    <Image
                        src={item.cover_image_url}
                        alt={item.title}
                        fill
                        className="object-cover transition-transform duration-300 group-hover:scale-110"
                        sizes="(max-width: 768px) 50vw, (max-width: 1200px) 33vw, 20vw"
                    />
                </div>
            ) : (
                <div className="absolute inset-0 w-full h-full bg-gradient-to-br from-muted via-card to-background flex items-center justify-center">
                    <Icon className="size-16 text-muted-foreground" />
                </div>
            )}

            {/* NEW Badge */}
            {renderNewBadge && (
                <div className="absolute top-2 left-2 px-2 py-0.5 bg-rose-600/90 backdrop-blur-md text-white text-[10px] font-bold tracking-wider rounded-sm shadow-sm z-20 pointer-events-none border border-white/10">
                    NEW
                </div>
            )}

            {/* Completed Badge */}
            {showCompletedBadge && (
                <div className="absolute top-2 right-2 p-1.5 bg-emerald-500 rounded-full shadow-lg z-20 pointer-events-none">
                    <CheckCircle2 className="size-4 text-white" />
                </div>
            )}

            {/* Bookmark Button */}
            {!hideBookmark && (
                <button
                    onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        if (isBookmarked) {
                            toggleMyList(item.id);
                            toast.success("Removed from My List");
                        } else {
                            toggleMyList(item.id);
                            toast.success("Added to My List");
                        }
                    }}
                    className={cn(
                        "focus-ring absolute top-2 p-1.5 rounded-full shadow-lg z-20 transition-all duration-300 backdrop-blur-sm",
                        showCompletedBadge ? "right-10" : "right-2",
                        isBookmarked
                            ? "bg-primary text-primary-foreground opacity-100"
                            : "bg-black/40 text-white hover:bg-black/70 opacity-100 lg:opacity-0 lg:group-hover:opacity-100"
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
            )}

            {/* Author (Top) */}
            {item.author && (
                <div className="absolute top-0 inset-x-0 pt-10 pb-8 px-8 bg-gradient-to-b from-black/80 via-black/40 to-transparent pointer-events-none z-30 flex justify-center">
                    <p className="text-[10px] md:text-[11px] font-medium text-white/90 uppercase tracking-[0.15em] text-center break-words whitespace-normal transform-gpu translate-z-0 drop-shadow-md leading-relaxed">
                        {item.author}
                    </p>
                </div>
            )}

            {/* Hover Overlay */}
            <div className="absolute inset-0 bg-black/30 opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none rounded-md" />

            {/* Bottom Info - Big Title & Fading Meta */}
            <div className="absolute inset-x-0 bottom-0 p-4 pt-20 bg-gradient-to-t from-black/95 via-black/70 to-transparent pointer-events-none z-30 pb-5">
                <div className="flex flex-col justify-end gap-1.5 h-full">
                    {/* Title */}
                    <h3 className="font-serif font-medium text-sm md:text-base text-white/95 line-clamp-3 leading-snug drop-shadow-xl group-hover:text-white transition-colors w-full">
                        {item.title}
                    </h3>

                    {/* Fading Metadata */}
                    <div className="w-full">
                        <p className="text-[10px] text-white/70 uppercase tracking-widest flex items-center gap-1.5 font-medium drop-shadow-md">
                            {item.type}
                            {item.category && (
                                <>
                                    <span className="opacity-40">•</span>
                                    <span>{item.category}</span>
                                </>
                            )}
                            {item.duration_seconds && (
                                <>
                                    <span className="opacity-40">•</span>
                                    <span className="whitespace-nowrap flex-shrink-0">
                                        {Math.round(item.duration_seconds / 60) < 60
                                            ? `${Math.round(item.duration_seconds / 60)} min`
                                            : `${Math.floor(Math.round(item.duration_seconds / 60) / 60)}h ${Math.round(item.duration_seconds / 60) % 60 > 0 ? `${Math.round(item.duration_seconds / 60) % 60}m` : ""
                                            }`}
                                    </span>
                                </>
                            )}
                        </p>
                    </div>
                </div>
            </div>

            {/* Progress Bar */}
            {showProgress && (
                <div className="absolute inset-x-0 bottom-0 h-1.5 bg-black/40 z-40 backdrop-blur-sm">
                    <div
                        className="h-full bg-white transition-all duration-300 shadow-[0_0_8px_rgba(255,255,255,0.8)]"
                        style={{ width: `${percentage}%` }}
                    />
                </div>
            )}

            {/* Remove Button (Trash) */}
            {onRemove && (
                <button
                    onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        onRemove(item.id);
                    }}
                    className="focus-ring absolute top-2 left-2 p-1.5 bg-black/50 hover:bg-red-500/80 rounded-full opacity-100 lg:opacity-0 lg:group-hover:opacity-100 transition-all duration-300 z-20 backdrop-blur-sm"
                    title="Remove from progress"
                    aria-label="Remove from progress"
                >
                    <Trash2 className="size-4 text-white" />
                </button>
            )}

            {/* Border on hover */}
            <div className="absolute inset-0 border-2 border-transparent group-hover:border-primary/75 rounded-md transition-colors pointer-events-none z-30" />
        </div>
    );
}
