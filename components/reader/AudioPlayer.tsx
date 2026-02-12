"use client";

/**
 * Audio Player Component
 *
 * A sleek, inline audio player for "Read For Me" functionality.
 * Displays in the Reader header when audio is available.
 */

import { useState, useRef, useEffect } from "react";
import { Play, Pause, Volume2, VolumeX, Headphones } from "lucide-react";

interface AudioPlayerProps {
    src: string;
    title?: string;
}

export function AudioPlayer({ src, title }: AudioPlayerProps) {
    const audioRef = useRef<HTMLAudioElement>(null);
    const [isPlaying, setIsPlaying] = useState(false);
    const [currentTime, setCurrentTime] = useState(0);
    const [duration, setDuration] = useState(0);
    const [isMuted, setIsMuted] = useState(false);
    const [playbackRate, setPlaybackRate] = useState(1);

    useEffect(() => {
        const audio = audioRef.current;
        if (!audio) return;

        const handleTimeUpdate = () => setCurrentTime(audio.currentTime);
        const handleLoadedMetadata = () => setDuration(audio.duration);
        const handleEnded = () => setIsPlaying(false);

        audio.addEventListener("timeupdate", handleTimeUpdate);
        audio.addEventListener("loadedmetadata", handleLoadedMetadata);
        audio.addEventListener("ended", handleEnded);

        return () => {
            audio.removeEventListener("timeupdate", handleTimeUpdate);
            audio.removeEventListener("loadedmetadata", handleLoadedMetadata);
            audio.removeEventListener("ended", handleEnded);
        };
    }, []);

    const togglePlay = () => {
        const audio = audioRef.current;
        if (!audio) return;

        if (isPlaying) {
            audio.pause();
        } else {
            audio.play();
        }
        setIsPlaying(!isPlaying);
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

    return (
        <div className="relative overflow-hidden rounded-2xl bg-card/95 backdrop-blur-sm border border-border shadow-xl">
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
                            className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
                            aria-label="Seek timeline"
                        />
                    </div>

                    {/* Time display */}
                    <div className="flex justify-between text-xs text-muted-foreground font-mono">
                        <span>{formatTime(currentTime)}</span>
                        <span>{formatTime(duration)}</span>
                    </div>
                </div>

                {/* Right controls */}
                <div className="flex items-center gap-1">
                    {/* Playback Speed */}
                    <button
                        onClick={cyclePlaybackRate}
                        className="px-2.5 py-1.5 text-xs font-semibold text-muted-foreground hover:text-foreground bg-secondary hover:bg-secondary/70 rounded-lg transition-colors min-w-[44px]"
                        title="Change playback speed"
                    >
                        {playbackRate}x
                    </button>

                    {/* Mute Button */}
                    <button
                        onClick={toggleMute}
                        className="p-2 text-muted-foreground hover:text-foreground hover:bg-secondary rounded-lg transition-colors"
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
        </div>
    );
}
