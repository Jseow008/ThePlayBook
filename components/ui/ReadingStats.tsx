"use client";

import { useReadingProgress } from "@/hooks/useReadingProgress";
import { BookOpen, Trophy, Bookmark } from "lucide-react";
import { useMemo } from "react";

export function ReadingStats() {
    const {
        inProgressCount,
        completedCount,
        myListCount,
        isLoaded
    } = useReadingProgress();

    // Stats data with semantic colors
    // Stats data with monochrome/neutral styling
    const stats = useMemo(() => [
        {
            label: "Books Read",
            value: completedCount,
            icon: Trophy,
            color: "text-foreground", // White/Black
            bg: "bg-secondary/40",
            border: "border-border"
        },
        {
            label: "In Progress",
            value: inProgressCount,
            icon: BookOpen,
            color: "text-zinc-400", // Subtle grey/brown feel
            bg: "bg-zinc-500/10",
            border: "border-zinc-500/20"
        },
        {
            label: "Saved to List",
            value: myListCount,
            icon: Bookmark,
            color: "text-stone-400", // Warmer grey/brown
            bg: "bg-stone-500/10",
            border: "border-stone-500/20"
        }
    ], [completedCount, inProgressCount, myListCount]);

    if (!isLoaded) {
        return (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {[...Array(3)].map((_, i) => (
                    <div
                        key={i}
                        className="relative overflow-hidden rounded-xl p-6 border border-border bg-card animate-pulse"
                    >
                        <div className="flex items-center justify-between">
                            <div className="space-y-2">
                                <div className="h-4 w-20 bg-muted rounded" />
                                <div className="h-8 w-12 bg-muted rounded" />
                            </div>
                            <div className="w-12 h-12 bg-muted rounded-full" />
                        </div>
                    </div>
                ))}
            </div>
        );
    }

    return (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {stats.map((stat) => (
                <div
                    key={stat.label}
                    className={`relative overflow-hidden rounded-xl p-6 border ${stat.border} ${stat.bg} backdrop-blur-sm transition-all duration-300 hover:scale-[1.02] hover:shadow-lg`}
                >
                    <div className="flex items-center justify-between">
                        <div>
                            <p className="text-sm font-medium text-muted-foreground uppercase tracking-wider mb-1">
                                {stat.label}
                            </p>
                            <p className="text-3xl font-bold text-foreground">
                                {stat.value}
                            </p>
                        </div>
                        <div className={`p-3 rounded-full ${stat.bg} ${stat.color}`}>
                            <stat.icon className="w-6 h-6" />
                        </div>
                    </div>
                </div>
            ))}
        </div>
    );
}
