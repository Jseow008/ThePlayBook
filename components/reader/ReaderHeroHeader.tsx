"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowLeft, Share2, Clock, Volume2 } from "lucide-react";
import { AudioPlayer } from "./AudioPlayer";
import { APP_NAME } from "@/lib/brand";

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
}: ReaderHeroHeaderProps) {
    const [showCopiedToast, setShowCopiedToast] = useState(false);

    const progressPercent =
        segmentsTotal > 0
            ? Math.round((segmentsRead / segmentsTotal) * 100)
            : 0;

    const handleShare = async () => {
        const shareData = {
            title,
            text: `Read "${title}" on ${APP_NAME}`,
            url: window.location.href,
        };

        try {
            if (
                navigator.share &&
                navigator.canShare &&
                navigator.canShare(shareData)
            ) {
                await navigator.share(shareData);
            } else {
                await navigator.clipboard.writeText(window.location.href);
                setShowCopiedToast(true);
                setTimeout(() => setShowCopiedToast(false), 2000);
            }
        } catch (err) {
            console.error("Error sharing:", err);
        }
    };

    return (
        <header className="mb-8">
            {/* Back Button */}
            <div className="mb-8">
                <Link
                    href="/"
                    className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-secondary/50 hover:bg-secondary text-sm font-medium text-muted-foreground hover:text-foreground transition-all group"
                >
                    <ArrowLeft className="size-4 group-hover:-translate-x-0.5 transition-transform" />
                    <span>Back to Library</span>
                </Link>
            </div>

            {/* Hero Card */}
            <div className="flex flex-col sm:flex-row gap-6 sm:gap-8">
                {/* Cover Image */}
                {coverImageUrl && (
                    <div className="flex-shrink-0 w-full sm:w-48 md:w-56">
                        <div className="aspect-[2/3] sm:aspect-auto sm:h-full rounded-xl overflow-hidden shadow-xl shadow-black/30 border border-white/10">
                            <img
                                src={coverImageUrl}
                                alt={title}
                                className="w-full h-full object-cover"
                            />
                        </div>
                    </div>
                )}

                {/* Title & Info */}
                <div className="flex-1 flex flex-col justify-center min-w-0">
                    <h1 className="text-2xl sm:text-3xl md:text-4xl font-bold text-foreground tracking-tight leading-[1.15] mb-2">
                        {title}
                    </h1>
                    {author && (
                        <p className="text-base sm:text-lg text-muted-foreground mb-5">
                            {author}
                        </p>
                    )}

                    {/* Metadata Row */}
                    <div className="flex flex-wrap items-center gap-2.5">
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

                        {/* Share Button */}
                        <button
                            onClick={handleShare}
                            className="p-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
                            title={
                                showCopiedToast
                                    ? "Link Copied!"
                                    : "Share"
                            }
                        >
                            <Share2 className="size-4" />
                        </button>

                        {/* Copied Toast */}
                        {showCopiedToast && (
                            <span className="text-xs text-green-400 font-medium animate-in fade-in">
                                Copied!
                            </span>
                        )}
                    </div>
                </div>
            </div>

            {/* Audio Player (Always Visible) */}
            {audioUrl && (
                <div className="mt-8 animate-fade-in">
                    <AudioPlayer
                        src={audioUrl}
                        title="Listen to this summary"
                    />
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
