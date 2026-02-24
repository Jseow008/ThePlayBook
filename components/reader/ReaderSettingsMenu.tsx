"use client";

import { useState, useRef, useEffect } from "react";
import { Minus, Plus, Sun, Moon, BookOpen, Maximize, Minimize, Rows4, Rows3, Rows2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { useReaderSettings, type ReaderTheme, type LineHeight } from "@/hooks/useReaderSettings";

const themeOptions: { value: ReaderTheme; label: string; icon: typeof Sun; preview: string }[] = [
    { value: "light", label: "Light", icon: Sun, preview: "bg-[hsl(0,0%,98%)] border-gray-300" },
    { value: "sepia", label: "Sepia", icon: BookOpen, preview: "bg-[hsl(36,33%,94%)] border-amber-300" },
    { value: "dark", label: "Dark", icon: Moon, preview: "bg-[hsl(240,10%,3.9%)] border-zinc-600" },
];

export function ReaderSettingsMenu() {
    const [isOpen, setIsOpen] = useState(false);
    const [isFullscreen, setIsFullscreen] = useState(false);
    const menuRef = useRef<HTMLDivElement>(null);
    const { fontSize, fontFamily, readerTheme, lineHeight, setFontSize, setFontFamily, setReaderTheme, setLineHeight } = useReaderSettings();

    // Track Fullscreen status
    useEffect(() => {
        const handleFullscreenChange = () => {
            setIsFullscreen(!!document.fullscreenElement);
        };
        document.addEventListener("fullscreenchange", handleFullscreenChange);
        return () => document.removeEventListener("fullscreenchange", handleFullscreenChange);
    }, []);

    // Handle Escape key to close menu
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === "Escape" && isOpen) {
                setIsOpen(false);
            }
        };
        if (isOpen) {
            document.addEventListener("keydown", handleKeyDown);
        }
        return () => document.removeEventListener("keydown", handleKeyDown);
    }, [isOpen]);

    const toggleFullscreen = () => {
        if (!document.fullscreenElement) {
            document.documentElement.requestFullscreen().catch((err) => console.error(err));
        } else if (document.exitFullscreen) {
            document.exitFullscreen();
        }
        setIsOpen(false); // Close menu after toggling
    };

    // Close on click outside
    useEffect(() => {
        const handleClickOutside = (event: MouseEvent | TouchEvent) => {
            if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
                setIsOpen(false);
            }
        };

        if (isOpen) {
            document.addEventListener("mousedown", handleClickOutside);
            document.addEventListener("touchstart", handleClickOutside);
        }

        return () => {
            document.removeEventListener("mousedown", handleClickOutside);
            document.removeEventListener("touchstart", handleClickOutside);
        };
    }, [isOpen]);

    const handleDecreaseSize = () => {
        if (fontSize === "large") setFontSize("medium");
        else if (fontSize === "medium") setFontSize("small");
    };

    const handleIncreaseSize = () => {
        if (fontSize === "small") setFontSize("medium");
        else if (fontSize === "medium") setFontSize("large");
    };

    return (
        <div className="relative" ref={menuRef}>
            {/* Trigger Button */}
            <button
                onClick={() => setIsOpen(!isOpen)}
                className={cn(
                    "inline-flex items-center justify-center p-2 rounded-lg bg-secondary text-muted-foreground border border-border transition-colors hover:text-foreground hover:bg-secondary/80",
                    isOpen && "bg-secondary/80 text-foreground ring-2 ring-ring"
                )}
                aria-label="Display Settings"
                aria-expanded={isOpen}
            >
                <span className="font-serif italic font-bold text-[1.1rem] leading-none mb-0.5 mt-0.5">Aa</span>
            </button>

            {/* Dropdown Menu */}
            {isOpen && (
                <div className="absolute right-0 mt-2 w-64 bg-card border border-border rounded-xl shadow-2xl p-4 z-50 animate-fade-in origin-top-right">
                    <div className="space-y-4">
                        {/* Theme Selection */}
                        <div className="space-y-2">
                            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                                Theme
                            </span>
                            <div className="grid grid-cols-3 gap-2">
                                {themeOptions.map((option) => (
                                    <button
                                        key={option.value}
                                        onClick={() => setReaderTheme(option.value)}
                                        className={cn(
                                            "flex flex-col items-center gap-1.5 py-2 px-2 rounded-lg text-xs font-medium border transition-all",
                                            readerTheme === option.value
                                                ? "border-primary ring-1 ring-primary text-primary"
                                                : "border-transparent text-muted-foreground hover:bg-secondary hover:text-foreground"
                                        )}
                                    >
                                        <div className={cn("w-8 h-5 rounded border", option.preview)} />
                                        {option.label}
                                    </button>
                                ))}
                            </div>
                        </div>

                        {/* Font Family Selection */}
                        <div className="space-y-2">
                            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                                Font
                            </span>
                            <div className="grid grid-cols-2 gap-2">
                                <button
                                    onClick={() => setFontFamily("sans")}
                                    className={cn(
                                        "py-2 px-3 rounded-lg text-sm font-medium border transition-all",
                                        fontFamily === "sans"
                                            ? "bg-primary/10 border-primary text-primary"
                                            : "bg-secondary/50 border-transparent text-muted-foreground hover:bg-secondary hover:text-foreground"
                                    )}
                                >
                                    <span className="font-sans">Sans</span>
                                </button>
                                <button
                                    onClick={() => setFontFamily("serif")}
                                    className={cn(
                                        "py-2 px-3 rounded-lg text-sm font-medium border transition-all",
                                        fontFamily === "serif"
                                            ? "bg-primary/10 border-primary text-primary"
                                            : "bg-secondary/50 border-transparent text-muted-foreground hover:bg-secondary hover:text-foreground"
                                    )}
                                >
                                    <span className="font-serif">Serif</span>
                                </button>
                            </div>
                        </div>

                        {/* Font Size Selection */}
                        <div className="space-y-2">
                            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                                Size
                            </span>
                            <div className="flex items-center justify-between bg-secondary/50 rounded-lg border border-border/50 p-1">
                                <button
                                    onClick={handleDecreaseSize}
                                    disabled={fontSize === "small"}
                                    className="p-2.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-accent disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                                    aria-label="Decrease font size"
                                >
                                    <Minus className="size-4" />
                                </button>
                                <span className="text-sm font-medium text-foreground w-16 text-center capitalize">
                                    {fontSize}
                                </span>
                                <button
                                    onClick={handleIncreaseSize}
                                    disabled={fontSize === "large"}
                                    className="p-2.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-accent disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                                    aria-label="Increase font size"
                                >
                                    <Plus className="size-4" />
                                </button>
                            </div>
                        </div>

                        {/* Line Height Selection */}
                        <div className="space-y-2">
                            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                                Spacing
                            </span>
                            <div className="grid grid-cols-3 gap-2">
                                <button
                                    onClick={() => setLineHeight("compact")}
                                    className={cn(
                                        "py-2 px-2 rounded-lg flex justify-center items-center font-medium border transition-all",
                                        lineHeight === "compact"
                                            ? "bg-primary/10 border-primary text-primary text-secondary-foreground"
                                            : "bg-secondary/50 border-transparent text-muted-foreground hover:bg-secondary hover:text-foreground"
                                    )}
                                    title="Compact Spacing"
                                >
                                    <Rows4 className="size-4" />
                                </button>
                                <button
                                    onClick={() => setLineHeight("default")}
                                    className={cn(
                                        "py-2 px-2 rounded-lg flex justify-center items-center font-medium border transition-all",
                                        lineHeight === "default"
                                            ? "bg-primary/10 border-primary text-primary"
                                            : "bg-secondary/50 border-transparent text-muted-foreground hover:bg-secondary hover:text-foreground"
                                    )}
                                    title="Default Spacing"
                                >
                                    <Rows3 className="size-4" />
                                </button>
                                <button
                                    onClick={() => setLineHeight("relaxed")}
                                    className={cn(
                                        "py-2 px-2 rounded-lg flex justify-center items-center font-medium border transition-all",
                                        lineHeight === "relaxed"
                                            ? "bg-primary/10 border-primary text-primary"
                                            : "bg-secondary/50 border-transparent text-muted-foreground hover:bg-secondary hover:text-foreground"
                                    )}
                                    title="Relaxed Spacing"
                                >
                                    <Rows2 className="size-4" />
                                </button>
                            </div>
                        </div>

                        {/* Fullscreen Toggle */}
                        <div className="pt-2 mt-2 border-t border-border/50">
                            <button
                                onClick={toggleFullscreen}
                                className="w-full flex items-center justify-between p-2.5 rounded-lg text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
                            >
                                <span>{isFullscreen ? "Exit Fullscreen" : "Fullscreen"}</span>
                                {isFullscreen ? <Minimize className="size-4" /> : <Maximize className="size-4" />}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
