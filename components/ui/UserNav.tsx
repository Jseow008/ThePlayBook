"use client";

import { useEffect, useState, useRef } from "react";
import { User } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/client";
import { LogOut, User as UserIcon, Settings, Brain, Sparkles } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import { AVATAR_ICONS } from "@/lib/avatars";

export function UserNav() {
    const router = useRouter();
    const [user, setUser] = useState<User | null>(null);
    const [isOpen, setIsOpen] = useState(false);
    const wrapperRef = useRef<HTMLDivElement>(null);
    const triggerRef = useRef<HTMLButtonElement>(null);

    useEffect(() => {
        const supabase = createClient();

        const fetchUser = async () => {
            const { data: { user } } = await supabase.auth.getUser();
            setUser(user);
        };
        fetchUser();

        const { data: { subscription } } = supabase.auth.onAuthStateChange(
            (event, session) => {
                setUser(session?.user ?? null);
            }
        );

        return () => {
            subscription.unsubscribe();
        };
    }, []);

    // Close dropdown when clicking outside
    useEffect(() => {
        function handleClickOutside(event: MouseEvent) {
            if (wrapperRef.current && !wrapperRef.current.contains(event.target as Node)) {
                setIsOpen(false);
            }
        }
        document.addEventListener("mousedown", handleClickOutside);
        return () => document.removeEventListener("mousedown", handleClickOutside);
    }, []);

    // Handle Escape key
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === "Escape" && isOpen) {
                setIsOpen(false);
                triggerRef.current?.focus();
            }
        };

        if (isOpen) {
            document.addEventListener("keydown", handleKeyDown);
        }

        return () => {
            document.removeEventListener("keydown", handleKeyDown);
        };
    }, [isOpen]);

    const handleSignOut = async () => {
        const supabase = createClient();
        await supabase.auth.signOut();
        setIsOpen(false);
        router.refresh(); // Clear server component cache
        router.push("/login");
    };

    if (!user) {
        return (
            <Link
                href="/login"
                className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
            >
                Sign In
            </Link>
        );
    }

    return (
        <div className="relative" ref={wrapperRef}>
            <button
                ref={triggerRef}
                onClick={() => setIsOpen(!isOpen)}
                className="flex items-center gap-2 outline-none rounded-full ring-offset-background focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 transition-all hover:ring-2 hover:ring-ring/50"
                aria-label="Open user menu"
                aria-haspopup="true"
                aria-expanded={isOpen}
                aria-controls="user-menu"
            >
                <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center border border-border overflow-hidden">
                    {(user.user_metadata?.avatar_icon || user.user_metadata?.avatar_url) ? (
                        <img
                            src={
                                user.user_metadata?.avatar_icon
                                    ? (AVATAR_ICONS.find(i => i.id === user.user_metadata.avatar_icon)?.src || AVATAR_ICONS[0].src)
                                    : user.user_metadata.avatar_url
                            }
                            alt={user.user_metadata.full_name || "User"}
                            className="h-full w-full object-cover"
                        />
                    ) : (
                        <span className="text-xs font-medium text-primary">
                            {(user.email?.[0] || "U").toUpperCase()}
                        </span>
                    )}
                </div>
            </button>

            {isOpen && (
                <div
                    id="user-menu"
                    role="menu"
                    className="absolute right-0 mt-2 w-56 rounded-md border border-border bg-popover p-1 shadow-lg text-popover-foreground z-50 animate-in fade-in zoom-in-95 duration-200"
                >
                    <div className="px-2 py-1.5 border-b border-border mb-1">
                        <p className="text-sm font-medium leading-none truncate">
                            {user.user_metadata?.full_name || "User"}
                        </p>
                        <p className="text-xs text-muted-foreground truncate mt-1">
                            {user.email}
                        </p>
                    </div>

                    <Link
                        href="/profile"
                        role="menuitem"
                        className="flex items-center gap-2 px-2 py-1.5 text-sm rounded-sm hover:bg-accent hover:text-accent-foreground cursor-default w-full focus:bg-accent focus:text-accent-foreground outline-none"
                        onClick={() => setIsOpen(false)}
                    >
                        <UserIcon className="h-4 w-4" />
                        <span>Profile</span>
                    </Link>

                    <Link
                        href="/brain"
                        role="menuitem"
                        className="flex items-center gap-2 px-2 py-1.5 text-sm rounded-sm hover:bg-accent hover:text-accent-foreground cursor-default w-full focus:bg-accent focus:text-accent-foreground outline-none"
                        onClick={() => setIsOpen(false)}
                    >
                        <Brain className="h-4 w-4" />
                        <span>Second Brain</span>
                    </Link>

                    <Link
                        href="/ask"
                        role="menuitem"
                        className="flex items-center gap-2 px-2 py-1.5 text-sm rounded-sm hover:bg-accent hover:text-accent-foreground cursor-default w-full focus:bg-accent focus:text-accent-foreground outline-none"
                        onClick={() => setIsOpen(false)}
                    >
                        <Sparkles className="h-4 w-4" />
                        <span>Ask My Library</span>
                    </Link>

                    <Link
                        href="/settings"
                        role="menuitem"
                        className="flex items-center gap-2 px-2 py-1.5 text-sm rounded-sm hover:bg-accent hover:text-accent-foreground cursor-default w-full focus:bg-accent focus:text-accent-foreground outline-none"
                        onClick={() => setIsOpen(false)}
                    >
                        <Settings className="h-4 w-4" />
                        <span>Settings</span>
                    </Link>

                    <div className="h-px bg-border my-1" />

                    <button
                        role="menuitem"
                        onClick={handleSignOut}
                        className="flex items-center gap-2 px-2 py-1.5 text-sm rounded-sm hover:bg-destructive/10 hover:text-destructive cursor-default w-full text-left text-destructive/80 focus:bg-destructive/10 focus:text-destructive outline-none"
                    >
                        <LogOut className="h-4 w-4" />
                        <span>Sign out</span>
                    </button>
                </div>
            )}
        </div>
    );
}
