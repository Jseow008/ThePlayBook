"use client";

import Link from "next/link";
import { BookOpen, Headphones, FileText, CheckCircle2, Trash2, Plus, Check } from "lucide-react";
import type { ContentItem } from "@/types/database";
import { useReadingProgress } from "@/hooks/useReadingProgress";
import { cn } from "@/lib/utils";

interface ContentCardProps {
    item: ContentItem;
    showCompletedBadge?: boolean;
    onRemove?: (id: string) => void;
}

export function ContentCard({ item, showCompletedBadge = false, onRemove }: ContentCardProps) {
    const { isInMyList, toggleMyList } = useReadingProgress();
    const isBookmarked = isInMyList(item.id);

    const typeIcon = {
        podcast: Headphones,
        book: BookOpen,
        article: FileText,
    }[item.type];
    const Icon = typeIcon || BookOpen;

    return (
        <div className="group relative block aspect-[2/3] w-full bg-zinc-900 rounded-md overflow-hidden transition-transform duration-300 hover:scale-105 hover:z-10">
            {/* Main Link Overlay */}
            <Link href={`/preview/${item.id}`} className="absolute inset-0 z-10">
                <span className="sr-only">View {item.title}</span>
            </Link>

            {/* Background */}
            {item.cover_image_url ? (
                <img
                    src={item.cover_image_url}
                    alt={item.title}
                    className="absolute inset-0 w-full h-full object-cover"
                />
            ) : (
                <div className="absolute inset-0 w-full h-full bg-gradient-to-br from-zinc-700 via-zinc-800 to-zinc-900 flex items-center justify-center">
                    <Icon className="size-16 text-zinc-600" />
                </div>
            )}

            {/* NEW Badge */}
            {(() => {
                const isNew = new Date(item.created_at) > new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
                if (isNew && !showCompletedBadge) {
                    return (
                        <div className="absolute top-2 left-2 px-2 py-0.5 bg-red-600 text-white text-[10px] font-bold tracking-wider rounded-sm shadow-lg z-20 pointer-events-none">
                            NEW
                        </div>
                    );
                }
                return null;
            })()}

            {/* Completed Badge */}
            {showCompletedBadge && (
                <div className="absolute top-2 right-2 p-1.5 bg-emerald-500 rounded-full shadow-lg z-20 pointer-events-none">
                    <CheckCircle2 className="size-4 text-white" />
                </div>
            )}

            {/* Bookmark Button */}
            <button
                onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    toggleMyList(item.id);
                }}
                className={cn(
                    "absolute top-2 p-1.5 rounded-full shadow-lg z-20 transition-all duration-300 backdrop-blur-sm",
                    showCompletedBadge ? "right-10" : "right-2",
                    isBookmarked
                        ? "bg-primary text-primary-foreground"
                        : "bg-black/40 text-white hover:bg-black/70 opacity-0 group-hover:opacity-100"
                )}
                title={isBookmarked ? "Remove from My List" : "Add to My List"}
            >
                {isBookmarked ? (
                    <Check className="size-4" />
                ) : (
                    <Plus className="size-4" />
                )}
            </button>

            {/* Hover Overlay */}
            <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/40 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none" />

            {/* Bottom Info - Always visible */}
            <div className="absolute inset-x-0 bottom-0 p-3 bg-gradient-to-t from-black/90 to-transparent pointer-events-none">
                <div className="flex items-center gap-2 mb-1">
                    <p className="text-[10px] text-zinc-400 uppercase tracking-wider flex items-center gap-1">
                        {item.type}
                        {item.category && (
                            <>
                                <span className="text-zinc-600">•</span>
                                <span className="text-zinc-300">{item.category}</span>
                            </>
                        )}
                    </p>
                </div>
                <h3 className="font-medium text-sm text-white line-clamp-2 group-hover:text-primary transition-colors">
                    {item.title}
                </h3>
                {item.author && (
                    <p className="text-xs text-zinc-400 truncate mt-0.5 opacity-0 group-hover:opacity-100 transition-opacity duration-300">
                        {item.author}
                    </p>
                )}
            </div>

            {/* Remove Button (Trash) */}
            {onRemove && (
                <button
                    onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        onRemove(item.id);
                    }}
                    className="absolute top-2 left-2 p-1.5 bg-black/50 hover:bg-red-500/80 rounded-full opacity-0 group-hover:opacity-100 transition-all duration-300 z-20 backdrop-blur-sm"
                    title="Remove from progress"
                >
                    <Trash2 className="size-4 text-white" />
                </button>
            )}

            {/* Border on hover */}
            <div className="absolute inset-0 border-2 border-transparent group-hover:border-primary/75 rounded-md transition-colors pointer-events-none z-50" />
        </div>
    );
}
