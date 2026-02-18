"use client";

import { AuthUser as User } from "@supabase/supabase-js";
import { Calendar, Award, Book, BookOpen, Sparkles, Edit2, Check } from "lucide-react";
import { format } from "date-fns";
import { useReadingProgress } from "@/hooks/useReadingProgress";
import { useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";

interface ProfileHeaderProps {
    user: User;
}

import { AVATAR_ICONS } from "@/lib/avatars";

export function ProfileHeader({ user }: ProfileHeaderProps) {
    const joinedDate = user.created_at ? new Date(user.created_at) : new Date();
    const { completedCount } = useReadingProgress();
    const supabase = createClient();
    const router = useRouter();

    const [isEditing, setIsEditing] = useState(false);
    const [selectedIconId, setSelectedIconId] = useState(user.user_metadata?.avatar_icon || "user");
    const [isSaving, setIsSaving] = useState(false);

    // Determine badge and progress
    const { badge, progress, nextThreshold } = useMemo(() => {
        const levels = [
            { threshold: 700, title: "Grandmaster", color: "text-rose-400", bg: "bg-rose-500/10", border: "border-rose-500/20", icon: Sparkles, barColor: "bg-rose-400" },
            { threshold: 250, title: "Sage", color: "text-purple-400", bg: "bg-purple-500/10", border: "border-purple-500/20", icon: Sparkles, barColor: "bg-purple-400" },
            { threshold: 50, title: "Scholar", color: "text-blue-400", bg: "bg-blue-500/10", border: "border-blue-500/20", icon: BookOpen, barColor: "bg-blue-400" },
            { threshold: 20, title: "Dedicated Reader", color: "text-emerald-400", bg: "bg-emerald-500/10", border: "border-emerald-500/20", icon: Book, barColor: "bg-emerald-400" },
            { threshold: 0, title: "Knowledge Seeker", color: "text-amber-400", bg: "bg-amber-500/10", border: "border-amber-500/20", icon: Award, barColor: "bg-amber-400" },
        ];

        const currentLevel = levels.find(l => completedCount >= l.threshold) || levels[levels.length - 1];
        const nextLevelIndex = levels.indexOf(currentLevel) - 1;
        const nextLevel = nextLevelIndex >= 0 ? levels[nextLevelIndex] : null;

        let progressPercent = 100;
        if (nextLevel) {
            const range = nextLevel.threshold - currentLevel.threshold;
            const current = completedCount - currentLevel.threshold;
            progressPercent = Math.min(100, Math.max(0, (current / range) * 100));
        }

        return {
            badge: currentLevel,
            progress: progressPercent,
            nextThreshold: nextLevel?.threshold,
            nextTitle: nextLevel?.title
        };
    }, [completedCount]);

    const handleSaveAvatar = async () => {
        setIsSaving(true);
        try {
            const { error } = await supabase.auth.updateUser({
                data: { avatar_icon: selectedIconId }
            });

            if (error) throw error;
            setIsEditing(false);
            router.refresh(); // Refresh to show new avatar
        } catch (e) {
            console.error("Failed to update avatar", e);
        } finally {
            setIsSaving(false);
        }
    };

    const displayName = user.user_metadata?.full_name || "Reader";
    const activeAvatar = AVATAR_ICONS.find(i => i.id === selectedIconId) || AVATAR_ICONS[0];

    return (
        <div className="relative overflow-hidden rounded-2xl bg-card/50 border border-border/50 shadow-xl animate-fade-in group">
            {/* Background Pattern - Subtle */}
            <div className="absolute inset-0 opacity-10 pointer-events-none">
                <div className="absolute -top-24 -right-24 w-96 h-96 bg-primary rounded-full blur-3xl opacity-5" />
                <div className="absolute -bottom-24 -left-24 w-72 h-72 bg-secondary rounded-full blur-3xl opacity-5" />
            </div>

            <div className="relative z-10 p-6 md:p-8">
                <div className="flex flex-col items-center text-center space-y-4">

                    {/* Avatar with Edit Overlay */}
                    <div className="relative group/avatar">
                        <div className="w-24 h-24 md:w-28 md:h-28 rounded-full bg-secondary/80 flex items-center justify-center shadow-2xl ring-4 ring-background/50 overflow-hidden">
                            <img
                                src={activeAvatar.src}
                                alt={activeAvatar.label}
                                className="w-full h-full object-cover scale-110"
                            />
                        </div>

                        <button
                            onClick={() => setIsEditing(!isEditing)}
                            className="absolute bottom-0 right-0 p-2 rounded-full bg-primary text-primary-foreground shadow-lg hover:bg-primary/90 transition-transform hover:scale-110"
                            aria-label="Edit Avatar"
                        >
                            <Edit2 className="w-4 h-4" />
                        </button>
                    </div>

                    {/* Avatar Selection Area (Expandable) */}
                    {isEditing && (
                        <div className="flex flex-wrap justify-center gap-3 p-4 bg-secondary/30 rounded-xl border border-border/50 animate-in fade-in slide-in-from-top-2 max-w-sm">
                            {AVATAR_ICONS.map((item) => (
                                <button
                                    key={item.id}
                                    onClick={() => setSelectedIconId(item.id)}
                                    className={`relative w-12 h-12 rounded-full overflow-hidden transition-all ${selectedIconId === item.id
                                        ? "ring-2 ring-primary ring-offset-2 ring-offset-background scale-110 opacity-100"
                                        : "opacity-60 hover:opacity-100 hover:scale-105"
                                        }`}
                                >
                                    <img
                                        src={item.src}
                                        alt={item.label}
                                        className="w-full h-full object-cover bg-secondary"
                                    />
                                </button>
                            ))}
                            <div className="w-full flex justify-center mt-2">
                                <button
                                    onClick={handleSaveAvatar}
                                    disabled={isSaving}
                                    className="px-4 py-1.5 bg-primary text-primary-foreground text-xs font-bold rounded-full hover:bg-primary/90 transition-colors flex items-center gap-2"
                                >
                                    {isSaving ? "Saving..." : <><Check className="w-3 h-3" /> Save Avatar</>}
                                </button>
                            </div>
                        </div>
                    )}

                    {/* User Identity */}
                    <div className="space-y-1">
                        <h1 className="text-2xl md:text-3xl font-bold text-foreground tracking-tight">
                            {displayName}
                        </h1>
                        <div className="flex items-center justify-center gap-2 text-muted-foreground text-sm">
                            <Calendar className="w-3.5 h-3.5" />
                            <span>Member since {format(joinedDate, "MMMM yyyy")}</span>
                        </div>
                    </div>

                    {/* Gamification Status */}
                    <div className="w-full max-w-xs space-y-3 pt-2">
                        <div className={`inline-flex items-center gap-2 px-4 py-1.5 ${badge.bg} border ${badge.border} rounded-full`}>
                            <badge.icon className={`w-4 h-4 ${badge.color}`} />
                            <span className={`text-sm font-bold ${badge.color}`}>{badge.title}</span>
                        </div>

                        {nextThreshold !== undefined && (
                            <div className="space-y-2">
                                <div className="flex justify-between text-xs font-medium text-muted-foreground/80 px-1">
                                    <span>Current: {completedCount}</span>
                                    <span>Goal: {nextThreshold}</span>
                                </div>
                                <div className="h-2.5 w-full bg-white/20 rounded-full overflow-hidden ring-1 ring-white/10">
                                    <div
                                        className={`h-full ${badge.barColor} shadow-[0_0_10px_rgba(255,255,255,0.3)] transition-all duration-1000 ease-out relative`}
                                        style={{ width: `${Math.max(5, progress)}%` }} // Ensure at least 5% is shown so the bar is visible
                                    />
                                </div>
                                <div className="text-xs text-muted-foreground text-center mt-2">
                                    <span className="font-medium text-foreground">{nextThreshold - completedCount}</span>
                                    {nextThreshold - completedCount === 1 ? " more book" : " more books"} to reach&nbsp;
                                    <span className="font-bold text-foreground">{progress === 100 ? "Max Level" : "next level"}</span>
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}
