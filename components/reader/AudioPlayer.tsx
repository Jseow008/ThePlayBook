"use client";

/**
 * Audio Player Component
 *
 * A sleek, inline audio player for "Read For Me" functionality.
 * Displays in the Reader header when audio is available.
 */

import { useState, useRef, useEffect } from "react";
import { createPortal } from "react-dom";
import { Headphones, Pause, Play, RotateCcw, RotateCw, Volume2, VolumeX, X } from "lucide-react";
import { APP_NAME } from "@/lib/brand";
import { cn } from "@/lib/utils";
import { useVisualViewportGeometry } from "@/hooks/useVisualViewportGeometry";

interface AudioPlayerProps {
    src: string;
    title?: string;
    mediaTitle?: string;
    mediaAuthor?: string | null;
    mediaArtworkUrl?: string | null;
    initialTimeSec?: number;
    readerTheme?: string;
    showResumeAudioFollow?: boolean;
    isNotesDrawerOpen?: boolean;
    onMiniPlayerVisibilityChange?: (isVisible: boolean) => void;
    onMiniPlayerBottomInsetChange?: (bottomInsetPx: number) => void;
    onTimeChange?: (timeSec: number, metadata?: { durationSec: number; isEnded: boolean }) => void;
    onPlaybackStateChange?: (isPlaying: boolean) => void;
    onResumeAudioFollow?: () => void;
}

export function AudioPlayer({
    src,
    title,
    mediaTitle,
    mediaAuthor,
    mediaArtworkUrl,
    initialTimeSec = 0,
    readerTheme = "dark",
    showResumeAudioFollow = false,
    isNotesDrawerOpen = false,
    onMiniPlayerVisibilityChange,
    onMiniPlayerBottomInsetChange,
    onTimeChange,
    onPlaybackStateChange,
    onResumeAudioFollow,
}: AudioPlayerProps) {
    const playerContainerRef = useRef<HTMLDivElement>(null);
    const audioRef = useRef<HTMLAudioElement>(null);
    const hasAppliedInitialTimeRef = useRef(false);
    const [mounted, setMounted] = useState(false);
    const [isPlaying, setIsPlaying] = useState(false);
    const [currentTime, setCurrentTime] = useState(0);
    const [duration, setDuration] = useState(0);
    const [isMuted, setIsMuted] = useState(false);
    const [playbackRate, setPlaybackRate] = useState(1);
    const [playbackError, setPlaybackError] = useState("");
    const [isHeroPlayerVisible, setIsHeroPlayerVisible] = useState(true);
    const [isMiniPlayerDismissed, setIsMiniPlayerDismissed] = useState(false);
    const [hasEnded, setHasEnded] = useState(false);
    const { bottomInset: miniPlayerBottomInset } = useVisualViewportGeometry();

    useEffect(() => {
        setMounted(true);
    }, []);

    useEffect(() => {
        if (!("mediaSession" in navigator) || typeof MediaMetadata === "undefined") {
            return;
        }

        const artworkUrl = mediaArtworkUrl?.trim();
        let artwork: MediaImage[] | undefined;

        if (artworkUrl) {
            try {
                artwork = [{ src: new URL(artworkUrl, window.location.href).href }];
            } catch {
                artwork = undefined;
            }
        }

        const metadata = new MediaMetadata({
            title: mediaTitle?.trim() || title || "Audio",
            artist: mediaAuthor?.trim() || APP_NAME,
            album: APP_NAME,
            artwork,
        });

        navigator.mediaSession.metadata = metadata;

        return () => {
            if (navigator.mediaSession.metadata === metadata) {
                navigator.mediaSession.metadata = null;
            }
        };
    }, [mediaArtworkUrl, mediaAuthor, mediaTitle, title]);

    useEffect(() => {
        hasAppliedInitialTimeRef.current = false;
        setIsPlaying(false);
        setCurrentTime(0);
        setDuration(0);
        setPlaybackError("");
        setIsHeroPlayerVisible(true);
        setIsMiniPlayerDismissed(false);
        setHasEnded(false);
        onPlaybackStateChange?.(false);
    }, [onPlaybackStateChange, src]);

    useEffect(() => {
        const playerContainer = playerContainerRef.current;
        if (!playerContainer || typeof IntersectionObserver === "undefined") {
            return;
        }

        const observer = new IntersectionObserver(
            ([entry]) => {
                setIsHeroPlayerVisible(Boolean(entry?.isIntersecting));
            },
            {
                threshold: 0.2,
            }
        );

        observer.observe(playerContainer);
        return () => observer.disconnect();
    }, []);

    useEffect(() => {
        const audio = audioRef.current;
        if (!audio) return;

        const handleTimeUpdate = () => {
            setCurrentTime(audio.currentTime);
            if (audio.currentTime < audio.duration) {
                setHasEnded(false);
            }
            onTimeChange?.(audio.currentTime, {
                durationSec: Number.isFinite(audio.duration) ? audio.duration : 0,
                isEnded: false,
            });
        };
        const handleLoadedMetadata = () => {
            setDuration(Number.isFinite(audio.duration) ? audio.duration : 0);
        };
        const handleEnded = () => {
            setIsPlaying(false);
            setHasEnded(true);
            onPlaybackStateChange?.(false);
            onTimeChange?.(audio.currentTime, {
                durationSec: Number.isFinite(audio.duration) ? audio.duration : 0,
                isEnded: true,
            });
        };
        const handlePlay = () => {
            setIsPlaying(true);
            setIsMiniPlayerDismissed(false);
            setHasEnded(false);
            onPlaybackStateChange?.(true);
        };
        const handlePause = () => {
            setIsPlaying(false);
            onPlaybackStateChange?.(false);
        };
        const handleCanPlay = () => setPlaybackError("");
        const handleError = () => {
            const mediaError = audio.error;

            if (!mediaError) {
                setPlaybackError("This audio file could not be played.");
                return;
            }

            switch (mediaError.code) {
                case MediaError.MEDIA_ERR_ABORTED:
                    setPlaybackError("Audio playback was aborted.");
                    break;
                case MediaError.MEDIA_ERR_NETWORK:
                    setPlaybackError("The audio file could not be loaded due to a network error.");
                    break;
                case MediaError.MEDIA_ERR_DECODE:
                    setPlaybackError("The audio file was loaded but could not be decoded.");
                    break;
                case MediaError.MEDIA_ERR_SRC_NOT_SUPPORTED:
                    setPlaybackError("This audio format is not supported in the current browser.");
                    break;
                default:
                    setPlaybackError("This audio file could not be played.");
            }
        };

        audio.addEventListener("timeupdate", handleTimeUpdate);
        audio.addEventListener("loadedmetadata", handleLoadedMetadata);
        audio.addEventListener("ended", handleEnded);
        audio.addEventListener("play", handlePlay);
        audio.addEventListener("pause", handlePause);
        audio.addEventListener("canplay", handleCanPlay);
        audio.addEventListener("error", handleError);

        if (audio.readyState >= HTMLMediaElement.HAVE_METADATA) {
            handleLoadedMetadata();
        }

        return () => {
            audio.removeEventListener("timeupdate", handleTimeUpdate);
            audio.removeEventListener("loadedmetadata", handleLoadedMetadata);
            audio.removeEventListener("ended", handleEnded);
            audio.removeEventListener("play", handlePlay);
            audio.removeEventListener("pause", handlePause);
            audio.removeEventListener("canplay", handleCanPlay);
            audio.removeEventListener("error", handleError);
        };
    }, [onPlaybackStateChange, onTimeChange, src]);

    useEffect(() => {
        const audio = audioRef.current;
        if (
            !audio
            || hasAppliedInitialTimeRef.current
            || initialTimeSec <= 0
            || duration <= 0
        ) {
            return;
        }

        const safeResumeTime = Math.min(initialTimeSec, Math.max(0, duration - 0.25));
        if (safeResumeTime <= 0) {
            hasAppliedInitialTimeRef.current = true;
            return;
        }

        audio.currentTime = safeResumeTime;
        setCurrentTime(safeResumeTime);
        hasAppliedInitialTimeRef.current = true;
        onTimeChange?.(safeResumeTime, {
            durationSec: duration,
            isEnded: false,
        });
    }, [duration, initialTimeSec, onTimeChange]);

    const togglePlay = async () => {
        const audio = audioRef.current;
        if (!audio) return;

        if (isPlaying) {
            audio.pause();
            setIsPlaying(false);
            return;
        }

        try {
            setPlaybackError("");
            setIsMiniPlayerDismissed(false);
            setHasEnded(false);
            await audio.play();
            setIsPlaying(true);
        } catch (error) {
            const message = error instanceof Error && error.message.trim().length > 0
                ? error.message
                : "This audio file could not be played.";
            setPlaybackError(message);
            setIsPlaying(false);
        }
    };

    const toggleMute = () => {
        const audio = audioRef.current;
        if (!audio) return;

        audio.muted = !isMuted;
        setIsMuted(!isMuted);
    };

    const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
        const audio = audioRef.current;
        if (!audio) return;

        const newTime = parseFloat(e.target.value);
        audio.currentTime = newTime;
        setCurrentTime(newTime);
        setHasEnded(false);
        onTimeChange?.(newTime, {
            durationSec: Number.isFinite(audio.duration) ? audio.duration : 0,
            isEnded: false,
        });
    };

    const skipBy = (deltaSeconds: number) => {
        const audio = audioRef.current;
        if (!audio) return;

        const maxTime = Number.isFinite(audio.duration) ? audio.duration : duration;
        const nextTime = Math.min(Math.max(0, audio.currentTime + deltaSeconds), Math.max(0, maxTime || 0));
        audio.currentTime = nextTime;
        setCurrentTime(nextTime);
        setHasEnded(false);
        onTimeChange?.(nextTime, {
            durationSec: Number.isFinite(audio.duration) ? audio.duration : duration,
            isEnded: false,
        });
    };

    const dismissMiniPlayer = () => {
        const audio = audioRef.current;
        audio?.pause();
        setIsPlaying(false);
        setIsMiniPlayerDismissed(true);
        onPlaybackStateChange?.(false);
    };

    const cyclePlaybackRate = () => {
        const audio = audioRef.current;
        if (!audio) return;

        const rates = [1, 1.25, 1.5, 1.75, 2];
        const currentIndex = rates.indexOf(playbackRate);
        const nextRate = rates[(currentIndex + 1) % rates.length];
        audio.playbackRate = nextRate;
        setPlaybackRate(nextRate);
    };

    const formatTime = (seconds: number) => {
        if (isNaN(seconds)) return "0:00";
        const mins = Math.floor(seconds / 60);
        const secs = Math.floor(seconds % 60);
        return `${mins}:${secs.toString().padStart(2, "0")}`;
    };

    const progress = duration > 0 ? (currentTime / duration) * 100 : 0;
    const hasLoadedDuration = duration > 0;
    const miniPlayerTitle = mediaTitle?.trim() || title || "Audio";
    const miniPlayerLabel = mediaAuthor?.trim()
        ? `${miniPlayerTitle} by ${mediaAuthor.trim()}`
        : miniPlayerTitle;
    const hasResumableProgress = currentTime > 0 && duration > 0 && currentTime < duration;
    const canShowMiniPlayer = mounted
        && !isHeroPlayerVisible
        && !isNotesDrawerOpen
        && !isMiniPlayerDismissed
        && !hasEnded
        && (isPlaying || hasResumableProgress);

    useEffect(() => {
        onMiniPlayerVisibilityChange?.(canShowMiniPlayer);
    }, [canShowMiniPlayer, onMiniPlayerVisibilityChange]);

    useEffect(() => {
        onMiniPlayerBottomInsetChange?.(miniPlayerBottomInset);
    }, [miniPlayerBottomInset, onMiniPlayerBottomInsetChange]);

    return (
        <div ref={playerContainerRef} className="relative overflow-hidden rounded-2xl bg-card/95 backdrop-blur-sm border border-border shadow-xl">
            <audio ref={audioRef} src={src} preload="metadata" />

            {/* Header with label */}
            <div className="flex items-center justify-center gap-2 px-4 py-2 border-b border-border bg-muted/30">
                <Headphones className="w-3.5 h-3.5 text-muted-foreground" />
                <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                    {title || "Listen to this summary"}
                </span>
            </div>

            {/* Player controls */}
            <div className="flex items-center gap-4 px-5 py-4">
                {/* Play/Pause Button */}
                <button
                    onClick={togglePlay}
                    className={`w-12 h-12 flex items-center justify-center rounded-full transition-all duration-200 shadow-lg ${isPlaying
                        ? "bg-primary text-primary-foreground hover:bg-primary/90"
                        : "bg-primary text-primary-foreground hover:bg-primary/90 hover:scale-105"
                        }`}
                    aria-label={isPlaying ? "Pause" : "Play"}
                >
                    {isPlaying ? (
                        <Pause className="w-5 h-5" />
                    ) : (
                        <Play className="w-5 h-5 ml-0.5" />
                    )}
                </button>

                {/* Progress Section */}
                <div className="flex-1 flex flex-col gap-2">
                    {/* Progress bar container with increased hit area */}
                    <div className="relative h-6 flex items-center group">
                        {/* Visual track */}
                        <div className="absolute inset-x-0 h-1.5 bg-secondary rounded-full overflow-hidden pointer-events-none">
                            <div
                                className="h-full bg-primary rounded-full transition-all duration-100"
                                style={{ width: `${progress}%` }}
                            />
                        </div>
                        {/* Invisible interactive input */}
                        <input
                            type="range"
                            min="0"
                            max={duration || 0}
                            value={currentTime}
                            onChange={handleSeek}
                            disabled={!hasLoadedDuration}
                            className="absolute inset-0 z-10 h-full w-full cursor-pointer opacity-0 disabled:cursor-wait"
                            aria-label="Seek timeline"
                        />
                    </div>

                    {/* Time display */}
                    <div className="flex justify-between text-xs text-muted-foreground font-mono">
                        <span>{formatTime(currentTime)}</span>
                        <span>{hasLoadedDuration ? formatTime(duration) : "--:--"}</span>
                    </div>
                </div>

                {/* Right controls */}
                <div className="flex items-center gap-2 sm:gap-1">
                    {/* Playback Speed */}
                    <button
                        onClick={cyclePlaybackRate}
                        className="group inline-flex size-11 items-center justify-center text-xs font-semibold text-muted-foreground transition-colors hover:text-foreground sm:h-auto sm:w-auto sm:min-w-[44px]"
                        title="Change playback speed"
                    >
                        <span className="rounded-lg bg-secondary px-2.5 py-1.5 transition-colors group-hover:bg-secondary/70">
                            {playbackRate}x
                        </span>
                    </button>

                    {/* Mute Button */}
                    <button
                        onClick={toggleMute}
                        className="inline-flex size-11 items-center justify-center rounded-lg p-0 text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground sm:size-auto sm:p-2"
                        aria-label={isMuted ? "Unmute" : "Mute"}
                    >
                        {isMuted ? (
                            <VolumeX className="w-4 h-4" />
                        ) : (
                            <Volume2 className="w-4 h-4" />
                        )}
                    </button>
                </div>
            </div>

            {playbackError && (
                <div className="border-t border-border bg-destructive/5 px-5 py-3 text-xs font-medium text-destructive">
                    {playbackError}
                </div>
            )}

            {canShowMiniPlayer && createPortal(
                <div
                    className={cn(
                        `reader-${readerTheme}`,
                        "reader-audio-mini-dock fixed inset-x-0 bottom-0 z-[45] px-3 sm:inset-x-auto sm:left-1/2 sm:w-[min(56rem,calc(100vw-8rem))] sm:-translate-x-1/2 sm:px-0 lg:left-[calc(50%+2rem)]"
                    )}
                    style={{
                        "--reader-audio-viewport-bottom": `${miniPlayerBottomInset}px`,
                    } as React.CSSProperties}
                    role="region"
                    aria-label="Audio mini player"
                >
                    <div
                        aria-hidden="true"
                        className="pointer-events-none absolute inset-x-0 bottom-full h-16 bg-gradient-to-t from-background to-transparent"
                    />
                    <div
                        className={cn(
                            "animate-in fade-in slide-in-from-bottom-3 duration-300 motion-reduce:animate-none"
                        )}
                    >
                        <div className="overflow-hidden rounded-2xl border border-border/70 bg-card/95 shadow-[0_12px_32px_-18px_rgba(0,0,0,0.45)] backdrop-blur-xl">
                            <div className="h-0.5 bg-secondary">
                                <div
                                    className="h-full bg-primary transition-[width] duration-150"
                                    style={{ width: `${progress}%` }}
                                />
                            </div>

                            <div className="grid grid-cols-[minmax(0,1fr)_auto_auto_auto_minmax(0,1fr)] items-center gap-x-2 gap-y-1 px-3 py-2 sm:grid-cols-[auto_minmax(0,1fr)_auto] sm:gap-4 sm:px-5 lg:px-6">
                                <button
                                    type="button"
                                    onClick={togglePlay}
                                    className="focus-ring col-start-3 row-start-2 flex size-11 flex-shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground transition-colors hover:bg-primary/90 sm:col-auto sm:row-auto sm:size-9"
                                    aria-label={isPlaying ? "Pause mini player" : "Play mini player"}
                                >
                                    {isPlaying ? <Pause className="size-4" /> : <Play className="ml-0.5 size-4" />}
                                </button>

                                <div className="col-span-4 col-start-1 row-start-1 min-w-0 flex-1 sm:col-auto sm:row-auto">
                                    <p className="truncate text-xs font-semibold text-foreground" title={miniPlayerLabel}>
                                        {miniPlayerLabel}
                                    </p>
                                    <div className="mt-0.5 flex min-w-0 items-center gap-1.5">
                                        <span className="w-9 flex-shrink-0 font-mono text-[11px] text-muted-foreground">
                                            {formatTime(currentTime)}
                                        </span>
                                        <input
                                            type="range"
                                            min="0"
                                            max={duration || 0}
                                            value={currentTime}
                                            onChange={handleSeek}
                                            className="h-1.5 min-w-16 flex-1 cursor-pointer accent-primary"
                                            aria-label="Seek mini player timeline"
                                        />
                                    </div>
                                </div>

                                <div className="contents sm:flex sm:flex-shrink-0 sm:items-center sm:gap-1 sm:self-end">
                                    <button
                                        type="button"
                                        onClick={dismissMiniPlayer}
                                        className="focus-ring col-start-5 row-start-1 inline-flex size-11 items-center justify-center justify-self-end rounded-full text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground sm:order-last sm:size-auto sm:p-2"
                                        aria-label="Close audio mini player"
                                    >
                                        <X className="size-4" />
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => skipBy(-10)}
                                        className="focus-ring col-start-2 row-start-2 inline-flex size-11 flex-shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground sm:size-7"
                                        aria-label="Rewind 10 seconds"
                                    >
                                        <span className="relative inline-flex size-5 items-center justify-center">
                                            <RotateCcw className="absolute inset-0 size-5" strokeWidth={2.2} />
                                            <span className="text-[9px] font-bold leading-none">10</span>
                                        </span>
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => skipBy(10)}
                                        className="focus-ring col-start-4 row-start-2 inline-flex size-11 flex-shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground sm:size-7"
                                        aria-label="Forward 10 seconds"
                                    >
                                        <span className="relative inline-flex size-5 items-center justify-center">
                                            <RotateCw className="absolute inset-0 size-5" strokeWidth={2.2} />
                                            <span className="text-[9px] font-bold leading-none">10</span>
                                        </span>
                                    </button>
                                    <button
                                        type="button"
                                        onClick={cyclePlaybackRate}
                                        className="focus-ring group col-start-5 row-start-2 inline-flex size-11 flex-shrink-0 items-center justify-center justify-self-end text-[11px] font-semibold text-muted-foreground transition-colors hover:text-foreground sm:h-auto sm:w-auto sm:min-w-9"
                                        aria-label="Change mini player playback speed"
                                        title="Change playback speed"
                                    >
                                        <span className="rounded-md bg-secondary/70 px-1.5 py-1 transition-colors group-hover:bg-secondary">
                                            {playbackRate}x
                                        </span>
                                    </button>
                                    {showResumeAudioFollow && onResumeAudioFollow && (
                                        <button
                                            type="button"
                                            onClick={onResumeAudioFollow}
                                            className="focus-ring col-span-5 row-start-3 min-h-11 justify-self-end rounded-full border border-border/70 bg-background/60 px-2.5 py-1.5 text-xs font-semibold text-foreground transition-colors hover:border-primary/30 hover:bg-accent/45 sm:col-span-1 sm:row-auto sm:min-h-0 sm:justify-self-auto"
                                        >
                                            Follow audio
                                        </button>
                                    )}
                                </div>
                            </div>
                        </div>
                    </div>
                </div>,
                document.body
            )}
        </div>
    );
}
