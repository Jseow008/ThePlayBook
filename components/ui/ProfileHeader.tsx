"use client";

import { User } from "@supabase/supabase-js";
import { User as UserIcon, Calendar, Mail } from "lucide-react";
import { format } from "date-fns";

interface ProfileHeaderProps {
    user: User;
}

export function ProfileHeader({ user }: ProfileHeaderProps) {
    const joinedDate = user.created_at ? new Date(user.created_at) : new Date();

    // Get distinct colors based on email hash (simple consistent color generator)
    const getAvatarColor = (name: string) => {
        const colors = [
            "bg-red-500", "bg-orange-500", "bg-amber-500",
            "bg-green-500", "bg-emerald-500", "bg-teal-500",
            "bg-cyan-500", "bg-blue-500", "bg-indigo-500",
            "bg-violet-500", "bg-purple-500", "bg-fuchsia-500",
            "bg-pink-500", "bg-rose-500"
        ];
        let hash = 0;
        for (let i = 0; i < name.length; i++) {
            hash = name.charCodeAt(i) + ((hash << 5) - hash);
        }
        return colors[Math.abs(hash) % colors.length];
    };

    const avatarColor = getAvatarColor(user.email || "User");

    return (
        <div className="relative overflow-hidden rounded-xl bg-gradient-to-br from-zinc-800 to-zinc-900 border border-zinc-700/50 shadow-xl">
            {/* Background Pattern */}
            <div className="absolute inset-0 opacity-10 pointer-events-none">
                <div className="absolute -top-24 -right-24 w-96 h-96 bg-primary rounded-full blur-3xl opacity-20" />
                <div className="absolute -bottom-24 -left-24 w-72 h-72 bg-blue-500 rounded-full blur-3xl opacity-20" />
            </div>

            <div className="relative z-10 p-6 md:p-8 flex flex-col md:flex-row items-center md:items-start gap-6">
                {/* Avatar */}
                <div className="flex-shrink-0">
                    <div className={`w-24 h-24 md:w-32 md:h-32 rounded-full border-4 border-zinc-900 shadow-2xl flex items-center justify-center overflow-hidden ${!user.user_metadata?.avatar_url ? avatarColor : "bg-zinc-800"}`}>
                        {user.user_metadata?.avatar_url ? (
                            <img
                                src={user.user_metadata.avatar_url}
                                alt={user.user_metadata.full_name || "User"}
                                className="w-full h-full object-cover"
                            />
                        ) : (
                            <span className="text-4xl font-bold text-white drop-shadow-md">
                                {(user.email?.[0] || "U").toUpperCase()}
                            </span>
                        )}
                    </div>
                </div>

                {/* User Info */}
                <div className="flex-1 text-center md:text-left space-y-2">
                    <h1 className="text-3xl md:text-4xl font-bold text-white tracking-tight">
                        {user.user_metadata?.full_name || "Knowledge Seeker"}
                    </h1>

                    <div className="flex flex-col md:flex-row items-center gap-3 md:gap-6 text-zinc-400 text-sm md:text-base mt-2">
                        <div className="flex items-center gap-2">
                            <Mail className="w-4 h-4" />
                            <span>{user.email}</span>
                        </div>
                        <div className="hidden md:block w-1 h-1 bg-zinc-600 rounded-full" />
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
