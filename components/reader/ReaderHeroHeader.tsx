"use client";

import { useEffect, useState } from "react";
import { Clock, BookOpen } from "lucide-react";
import { AudioPlayer } from "./AudioPlayer";
import { APP_NAME } from "@/lib/brand";
import { ContentShareMenu } from "@/components/ui/ContentShareMenu";
import { ReaderSettingsMenu } from "./ReaderSettingsMenu";
import { ResilientImage } from "@/components/ui/ResilientImage";
import { SaveToLibraryButton } from "@/components/ui/SaveToLibraryButton";
import {
    READER_COVER_FRAME_CLASS,
    READER_COVER_IMAGE_SIZES,
    READER_COVER_WRAPPER_CLASS,
} from "@/components/ui/content-card-standards";

/**
 * Reader Hero Header
 *
 * Media-forward header: cover image + title/author + metadata badges.
 * Replaces the old 3-column header, sidebar back-button, and actions panel.
 */

interface ReaderHeroHeaderProps {
    contentId?: string;
    title: string;
    author: string | null;
    type: string;
    coverImageUrl: string | null;
    audioUrl: string | null;
    durationSeconds: number | null;
    segmentsTotal: number;
    segmentsCompleted: number;
    formattedReadingTime: string;
    readerTheme?: string;
    showResumeAudioFollow?: boolean;
    isNotesDrawerOpen?: boolean;
    onMiniPlayerVisibilityChange?: (isVisible: boolean) => void;
    onMiniPlayerBottomInsetChange?: (bottomInsetPx: number) => void;
    onResumeAudioFollow?: () => void;
    initialAudioTimeSec?: number;
    onAudioTimeChange?: (timeSec: number, metadata?: { durationSec: number; isEnded: boolean }) => void;
    onAudioPlaybackStateChange?: (isPlaying: boolean) => void;
}

export function ReaderHeroHeader({
    contentId,
    title,
    author,
    type,
    coverImageUrl,
    audioUrl,
    durationSeconds,
    segmentsTotal,
    segmentsCompleted,
    formattedReadingTime,
    readerTheme = "dark",
    showResumeAudioFollow = false,
    isNotesDrawerOpen = false,
    onMiniPlayerVisibilityChange,
    onMiniPlayerBottomInsetChange,
    onResumeAudioFollow,
    initialAudioTimeSec = 0,
    onAudioTimeChange,
    onAudioPlaybackStateChange,
}: ReaderHeroHeaderProps) {
    const boundedSegmentsCompleted = Math.min(segmentsTotal, Math.max(0, segmentsCompleted));
    const progressPercent =
        segmentsTotal > 0
            ? Math.min(100, Math.max(0, Math.round((boundedSegmentsCompleted / segmentsTotal) * 100)))
            : 0;
    const sectionLabel = segmentsTotal === 1 ? "section" : "sections";
    const progressText = `${boundedSegmentsCompleted} of ${segmentsTotal} ${sectionLabel} completed`;

    // Update Tab Title with Progress
    useEffect(() => {
        if (progressPercent > 0) {
            document.title = `(${progressPercent}%) ${title} — ${APP_NAME}`;
        } else {
            document.title = `${title} — ${APP_NAME}`;
        }
    }, [progressPercent, title]);

    // Safe URL for sharing - avoids SSR hydration mismatch.
    const [shareUrl, setShareUrl] = useState("");
    useEffect(() => {
        setShareUrl(window.location.href);
    }, []);

    return (
        <header className="mb-8">


            {/* Hero Card */}
            <div className="flex flex-col sm:flex-row gap-6 sm:gap-8">
                {/* Cover Image */}
                {coverImageUrl && (
                    <div className={READER_COVER_WRAPPER_CLASS}>
                        <div className={`${READER_COVER_FRAME_CLASS} rounded-xl overflow-hidden shadow-xl shadow-black/30 border border-white/10 relative mx-auto sm:mx-0`}>
                            <ResilientImage
                                src={coverImageUrl}
                                alt={title}
                                fill
                                sizes={READER_COVER_IMAGE_SIZES}
                                priority
                                surface="reader-hero"
                                className="object-cover"
                                fallback={
                                    <div className="absolute inset-0 flex items-center justify-center bg-gradient-to-br from-secondary via-card to-background">
                                        <BookOpen className="size-12 text-muted-foreground" />
                                    </div>
                                }
                            />
                        </div>
                    </div>
                )}

                {/* Title & Info */}
                <div className="flex-1 flex flex-col justify-center min-w-0">
                    <h1 className="text-2xl sm:text-3xl md:text-4xl font-bold text-foreground tracking-tight leading-[1.15] mb-2 text-center sm:text-left">
                        {title}
                    </h1>
                    {author && (
                        <p className="text-base sm:text-lg text-muted-foreground mb-5 text-center sm:text-left">
                            {author}
                        </p>
                    )}

                    {/* Metadata Row */}
                    <div className="flex flex-col items-center gap-3 sm:flex-row sm:flex-wrap sm:justify-start sm:gap-2.5">
                        <div className="flex flex-wrap items-center justify-center gap-2.5 sm:justify-start">
                            {/* Duration Badge */}
                            {durationSeconds && (
                                <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-secondary text-xs font-medium text-muted-foreground border border-border">
                                    <Clock className="size-3.5" />
                                    {Math.round(durationSeconds / 60)} min
                                </span>
                            )}

                            {/* Type Badge */}
                            <span className="px-3 py-1.5 rounded-lg bg-secondary text-xs font-bold uppercase tracking-wider text-muted-foreground border border-border">
                                {type}
                            </span>

                            {/* Time Spent Reading */}
                            <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-secondary/50 text-xs font-medium text-muted-foreground border border-border/50">
                                <span className="relative flex size-2">
                                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary/60 opacity-75"></span>
                                    <span className="relative inline-flex rounded-full size-2 bg-primary"></span>
                                </span>
                                {formattedReadingTime} read
                            </span>
                        </div>

                        <div className="flex items-center justify-center gap-2.5 sm:justify-start">
                            {/* Display Settings */}
                            <ReaderSettingsMenu />

                            {/* Save Button */}
                            {contentId && (
                                <SaveToLibraryButton
                                    contentId={contentId}
                                    contentTitle={title}
                                    className="focus-ring inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full border transition-colors disabled:cursor-wait"
                                    loadingClassName="border-border/35 bg-secondary/25 text-muted-foreground/60"
                                    savedClassName="border-primary/35 bg-primary/10 text-primary"
                                    unsavedClassName="border-border/45 bg-secondary/30 text-muted-foreground hover:bg-secondary/50 hover:text-foreground"
                                    iconClassName="size-5"
                                />
                            )}

                            {/* Share Menu */}
                            <ContentShareMenu
                                url={shareUrl}
                                title={title}
                                text={`Read "${title}" on ${APP_NAME}`}
                                source="reader_header"
                                contentId={contentId}
                                contentType={type}
                                className="focus-ring h-10 w-10 shrink-0 border border-border/45 bg-secondary/30 p-0 text-muted-foreground hover:bg-secondary/50 hover:text-foreground"
                            />
                        </div>
                    </div>
                </div>
            </div>

            {/* Audio Player (Always Visible) */}
            {audioUrl && (
                <div className="mt-8 animate-fade-in">
                    <AudioPlayer
                        src={audioUrl}
                        title="Listen to this summary"
                        mediaTitle={title}
                        mediaAuthor={author}
                        mediaArtworkUrl={coverImageUrl}
                        initialTimeSec={initialAudioTimeSec}
                        readerTheme={readerTheme}
                        showResumeAudioFollow={showResumeAudioFollow}
                        isNotesDrawerOpen={isNotesDrawerOpen}
                        onMiniPlayerVisibilityChange={onMiniPlayerVisibilityChange}
                        onMiniPlayerBottomInsetChange={onMiniPlayerBottomInsetChange}
                        onResumeAudioFollow={onResumeAudioFollow}
                        onTimeChange={onAudioTimeChange}
                        onPlaybackStateChange={onAudioPlaybackStateChange}
                    />
                    {showResumeAudioFollow && (
                        <div className="mt-3 flex flex-col gap-2 rounded-xl border border-border/60 bg-card/50 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
                            <p className="text-sm text-muted-foreground">
                                Audio follow is paused while you browse another section.
                            </p>
                            <button
                                type="button"
                                onClick={onResumeAudioFollow}
                                className="inline-flex items-center justify-center rounded-lg bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90"
                            >
                                Follow audio
                            </button>
                        </div>
                    )}
                </div>
            )}

            {/* Progress Bar */}
            <div className="mt-6">
                <div className="mb-1.5 flex items-center justify-between gap-3 text-xs text-muted-foreground">
                    <span>Sections completed</span>
                    <span className="text-right">{progressText}</span>
                </div>
                <div
                    className="h-1.5 bg-secondary rounded-full overflow-hidden"
                    role="progressbar"
                    aria-label="Reading progress"
                    aria-valuemin={0}
                    aria-valuemax={segmentsTotal}
                    aria-valuenow={boundedSegmentsCompleted}
                    aria-valuetext={progressText}
                >
                    <div
                        className="h-full bg-primary rounded-full transition-all duration-500"
                        style={{ width: `${progressPercent}%` }}
                    />
                </div>
            </div>
        </header>
    );
}
