"use client";

import { useState, useEffect } from "react";
import { Clock, BookOpen } from "lucide-react";
import { AudioPlayer } from "./AudioPlayer";
import { APP_NAME } from "@/lib/brand";
import { ShareButton } from "@/components/ui/ShareButton";
import { ReaderSettingsMenu } from "./ReaderSettingsMenu";
import { ResilientImage } from "@/components/ui/ResilientImage";

/**
 * Reader Hero Header
 *
 * Media-forward header: cover image + title/author + metadata badges.
 * Replaces the old 3-column header, sidebar back-button, and actions panel.
 */

interface ReaderHeroHeaderProps {
    title: string;
    author: string | null;
    type: string;
    coverImageUrl: string | null;
    audioUrl: string | null;
    durationSeconds: number | null;
    segmentsTotal: number;
    segmentsRead: number;
    formattedReadingTime: string;
    showResumeAudioFollow?: boolean;
    onResumeAudioFollow?: () => void;
    initialAudioTimeSec?: number;
    onAudioTimeChange?: (timeSec: number, metadata?: { durationSec: number; isEnded: boolean }) => void;
    onAudioPlaybackStateChange?: (isPlaying: boolean) => void;
}

export function ReaderHeroHeader({
    title,
    author,
    type,
    coverImageUrl,
    audioUrl,
    durationSeconds,
    segmentsTotal,
    segmentsRead,
    formattedReadingTime,
    showResumeAudioFollow = false,
    onResumeAudioFollow,
    initialAudioTimeSec = 0,
    onAudioTimeChange,
    onAudioPlaybackStateChange,
}: ReaderHeroHeaderProps) {
    const progressPercent =
        segmentsTotal > 0
            ? Math.min(100, Math.max(0, Math.round((segmentsRead / segmentsTotal) * 100)))
            : 0;

    // Update Tab Title with Progress
    useEffect(() => {
        if (progressPercent > 0) {
            document.title = `(${progressPercent}%) ${title} — ${APP_NAME}`;
        } else {
            document.title = `${title} — ${APP_NAME}`;
        }
    }, [progressPercent, title]);

    // Safe URL for sharing — avoids SSR hydration mismatch
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
                    <div className="flex-shrink-0 w-full sm:w-48 md:w-56">
                        <div className="aspect-[2/3] w-[140px] sm:w-full rounded-xl overflow-hidden shadow-xl shadow-black/30 border border-white/10 relative mx-auto sm:mx-0">
                            <ResilientImage
                                src={coverImageUrl}
                                alt={title}
                                fill
                                sizes="(max-width: 640px) 100vw, 224px"
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
                    <div className="flex flex-wrap items-center justify-center sm:justify-start gap-2.5">
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

                        {/* Display Settings */}
                        <ReaderSettingsMenu />

                        {/* Share Button */}
                        <ShareButton
                            url={shareUrl}
                            title={title}
                            text={`Read "${title}" on ${APP_NAME}`}
                            variant="icon"
                        />
                    </div>
                </div>
            </div>

            {/* Audio Player (Always Visible) */}
            {audioUrl && (
                <div className="mt-8 animate-fade-in">
                    <AudioPlayer
                        src={audioUrl}
                        title="Listen to this summary"
                        initialTimeSec={initialAudioTimeSec}
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
                <div className="flex items-center justify-between text-xs text-muted-foreground mb-1.5">
                    <span>Reading Progress</span>
                    <span>{progressPercent}%</span>
                </div>
                <div className="h-1.5 bg-secondary rounded-full overflow-hidden">
                    <div
                        className="h-full bg-primary rounded-full transition-all duration-500"
                        style={{ width: `${progressPercent}%` }}
                    />
                </div>
            </div>
        </header>
    );
}
