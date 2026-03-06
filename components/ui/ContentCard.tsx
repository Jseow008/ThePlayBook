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
          Math.round(
            (((progress.maxSegmentIndex ?? progress.lastSegmentIndex) + 1) / progress.totalSegments) * 100
          )
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
        <div className="pointer-events-none absolute left-2 top-2 z-20 rounded-sm border border-white/10 bg-rose-600/90 px-2 py-0.5 text-[10px] font-bold tracking-wider text-white shadow-sm backdrop-blur-md">
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
        <div className="pointer-events-none absolute inset-x-0 top-0 z-30 flex justify-center bg-gradient-to-b from-black/80 via-black/40 to-transparent px-8 pb-8 pt-10">
          <p className="translate-z-0 break-words text-center text-[10px] font-medium uppercase leading-relaxed tracking-[0.15em] whitespace-normal text-white/90 drop-shadow-md md:text-[11px]">
            {item.author}
          </p>
        </div>
      ) : null}

      <div className="pointer-events-none absolute inset-0 rounded-md bg-black/30 opacity-0 transition-opacity duration-300 group-hover:opacity-100" />

      <div className="pointer-events-none absolute inset-x-0 bottom-0 z-30 bg-gradient-to-t from-black/95 via-black/70 to-transparent p-4 pb-5 pt-20">
        <div className="flex h-full flex-col justify-end gap-1.5">
          <h3 className="w-full line-clamp-3 font-serif text-sm font-medium leading-snug text-white/95 transition-colors group-hover:text-white md:text-base">
            {item.title}
          </h3>

          <div className="w-full">
            <p className="flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-widest text-white/70 drop-shadow-md">
              {item.type}
              {item.category ? (
                <>
                  <span className="opacity-40">•</span>
                  <span>{item.category}</span>
                </>
              ) : null}
              {item.duration_seconds ? (
                <>
                  <span className="opacity-40">•</span>
                  <span className="whitespace-nowrap flex-shrink-0">
                    {Math.round(item.duration_seconds / 60) < 60
                      ? `${Math.round(item.duration_seconds / 60)} min`
                      : `${Math.floor(Math.round(item.duration_seconds / 60) / 60)}h ${
                          Math.round(item.duration_seconds / 60) % 60 > 0
                            ? `${Math.round(item.duration_seconds / 60) % 60}m`
                            : ""
                        }`}
                  </span>
                </>
              ) : null}
            </p>
          </div>
        </div>
      </div>

      {showProgress ? (
        <div className="absolute inset-x-0 bottom-0 z-40 h-1.5 bg-black/40 backdrop-blur-sm">
          <div
            className="h-full bg-white shadow-[0_0_8px_rgba(255,255,255,0.8)] transition-all duration-300"
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

      <div className="pointer-events-none absolute inset-0 z-30 rounded-md border-2 border-transparent transition-colors group-hover:border-primary/75" />
    </div>
  );
}
