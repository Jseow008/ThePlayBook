"use client";

import { AuthUser as User } from "@supabase/supabase-js";
import { Calendar, Mail, Award, Book, BookOpen, Sparkles } from "lucide-react";
import { format } from "date-fns";
import { useReadingProgress } from "@/hooks/useReadingProgress";
import { useMemo } from "react";

interface ProfileHeaderProps {
    user: User;
}

export function ProfileHeader({ user }: ProfileHeaderProps) {
    const joinedDate = user.created_at ? new Date(user.created_at) : new Date();
    const { completedCount } = useReadingProgress();

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
            nextThreshold: nextLevel?.threshold
        };
    }, [completedCount]);

    // Get distinct colors based on email hash (simple consistent color generator)
    const getAvatarColor = (name: string) => {
        const colors = [
            "from-red-500 to-orange-500",
            "from-orange-500 to-amber-500",
            "from-amber-500 to-yellow-500",
            "from-green-500 to-emerald-500",
            "from-emerald-500 to-teal-500",
            "from-teal-500 to-cyan-500",
            "from-cyan-500 to-blue-500",
            "from-blue-500 to-indigo-500",
            "from-indigo-500 to-violet-500",
            "from-violet-500 to-purple-500",
            "from-purple-500 to-fuchsia-500",
            "from-fuchsia-500 to-pink-500",
            "from-pink-500 to-rose-500",
        ];
        let hash = 0;
        for (let i = 0; i < name.length; i++) {
            hash = name.charCodeAt(i) + ((hash << 5) - hash);
        }
        return colors[Math.abs(hash) % colors.length];
    };

    const avatarGradient = getAvatarColor(user.email || "User");
    const displayName = user.user_metadata?.full_name || badge.title;

    return (
        <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-secondary/80 to-secondary border border-border shadow-xl animate-fade-in">
            {/* Background Pattern */}
            <div className="absolute inset-0 opacity-20 pointer-events-none">
                <div className="absolute -top-24 -right-24 w-96 h-96 bg-primary rounded-full blur-3xl opacity-10" />
                <div className="absolute -bottom-24 -left-24 w-72 h-72 bg-blue-500 rounded-full blur-3xl opacity-10" />
            </div>

            <div className="relative z-10 p-6 md:p-8">
                {/* Main Content - Centered Layout */}
                <div className="flex flex-col items-center text-center space-y-4">
                    {/* Avatar */}
                    <div className="relative">
                        <div className={`w-24 h-24 md:w-28 md:h-28 rounded-full bg-gradient-to-br ${avatarGradient} flex items-center justify-center shadow-2xl ring-4 ring-background/50`}>
                            {user.user_metadata?.avatar_url ? (
                                <img
                                    src={user.user_metadata.avatar_url}
                                    alt={displayName}
                                    className="w-full h-full object-cover rounded-full"
                                />
                            ) : (
                                <span className="text-4xl md:text-5xl font-bold text-white drop-shadow-md">
                                    {(user.email?.[0] || "U").toUpperCase()}
                                </span>
                            )}
                        </div>
                    </div>

                    {/* User Name */}
                    <div className="space-y-2">
                        <h1 className="text-2xl md:text-3xl font-bold text-foreground tracking-tight">
                            {displayName}
                        </h1>

                        {/* Achievement Badge & Progress */}
                        <div className="flex flex-col items-center gap-3 w-full max-w-[200px]">
                            <div className={`inline-flex items-center gap-2 px-4 py-1.5 ${badge.bg} border ${badge.border} rounded-full transition-all duration-300`}>
                                <badge.icon className={`w-4 h-4 ${badge.color}`} />
                                <span className={`text-sm font-bold ${badge.color}`}>{badge.title}</span>
                            </div>

                            {nextThreshold && (
                                <div className="w-full space-y-1.5">
                                    <div className="flex justify-between text-[10px] font-medium text-muted-foreground px-1">
                                        <span>{completedCount} / {nextThreshold} Books</span>
                                        <span>{Math.round(progress)}%</span>
                                    </div>
                                    <div className="h-2 w-full bg-secondary/30 rounded-full overflow-hidden ring-1 ring-border/50">
                                        <div
                                            className={`h-full ${badge.barColor} transition-all duration-1000 ease-out shadow-sm`}
                                            style={{ width: `${progress}%` }}
                                        />
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>

                    {/* User Details */}
                    <div className="flex flex-col sm:flex-row items-center gap-2 sm:gap-4 text-muted-foreground text-sm pt-2">
                        <div className="flex items-center gap-2">
                            <Mail className="w-4 h-4" />
                            <span>{user.email}</span>
                        </div>
                        <div className="hidden sm:block w-1 h-1 bg-muted-foreground/50 rounded-full" />
                        <div className="flex items-center gap-2">
                            <Calendar className="w-4 h-4" />
                            <span>Member since {format(joinedDate, "MMMM yyyy")}</span>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
