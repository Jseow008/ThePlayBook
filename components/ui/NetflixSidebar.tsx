"use client";

import { useState, useEffect } from "react";
import { User } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
    Search,
    Home,
    Shuffle,
    BookOpen,
    Library,
    BookMarked,
    CheckCircle2,
    ChevronDown,
    Plus,
    LayoutGrid,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useReadingProgress } from "@/hooks/useReadingProgress";

const navItems = [
    { icon: Search, label: "Search", href: "/search" },
    { icon: Home, label: "Home", href: "/" },
    { icon: LayoutGrid, label: "Browse Categories", href: "/categories" },
    { icon: Shuffle, label: "Surprise Me", href: "/random" },
];

export function NetflixSidebar() {
    const pathname = usePathname();
    const [isExpanded, setIsExpanded] = useState(false);
    const [isLibraryOpen, setIsLibraryOpen] = useState(false);
    const [user, setUser] = useState<User | null>(null);
    const supabase = createClient();

    const { inProgressCount, completedCount, myListCount, isLoaded } = useReadingProgress();

    useEffect(() => {
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



    // Close library when sidebar collapses
    useEffect(() => {
        if (!isExpanded) {
            setIsLibraryOpen(false);
        }
    }, [isExpanded]);

    const totalLibraryItems = inProgressCount + completedCount + myListCount;

    return (
        <aside
            onMouseEnter={() => setIsExpanded(true)}
            onMouseLeave={() => setIsExpanded(false)}
            className={cn(
                "fixed left-0 top-0 bottom-0 z-50 bg-black backdrop-blur-md border-r border-zinc-800/50 transition-all duration-300 hidden lg:flex flex-col",
                isExpanded ? "w-56" : "w-16"
            )}
        >
            {/* Logo */}
            <Link
                href="/"
                className={cn(
                    "flex items-center h-16 px-4 border-b border-zinc-800/50",
                    isExpanded ? "justify-start gap-3" : "justify-center"
                )}
            >
                <BookOpen className="size-6 text-primary flex-shrink-0" />
                <span
                    className={cn(
                        "font-bold text-lg text-foreground transition-opacity whitespace-nowrap",
                        isExpanded ? "opacity-100" : "opacity-0 w-0"
                    )}
                >
                    Lifebook
                </span>
            </Link>

            {/* Navigation */}
            <nav className="flex-1 py-6 overflow-y-auto">
                <ul className="space-y-1">
                    {navItems.map((item) => {
                        const isActive = pathname === item.href;
                        return (
                            <li key={item.href}>
                                <Link
                                    href={item.href}
                                    className={cn(
                                        "flex items-center h-12 px-4 transition-colors",
                                        isExpanded ? "justify-start gap-3" : "justify-center",
                                        isActive
                                            ? "text-foreground bg-zinc-800/50 border-l-4 border-primary"
                                            : "text-zinc-400 hover:text-foreground hover:bg-zinc-800/30"
                                    )}
                                >
                                    <item.icon
                                        className={cn(
                                            "size-5 flex-shrink-0",
                                            isActive && "text-primary"
                                        )}
                                    />
                                    <span
                                        className={cn(
                                            "text-sm font-medium transition-opacity whitespace-nowrap",
                                            isExpanded ? "opacity-100" : "opacity-0 w-0"
                                        )}
                                    >
                                        {item.label}
                                    </span>
                                </Link>
                            </li>
                        );
                    })}
                </ul>

                {/* Divider */}
                <div className="my-4 mx-4 border-t border-zinc-800/50" />

                {/* My Library Section */}
                <div className="space-y-1">
                    {/* My Library Header */}
                    <button
                        onClick={() => isExpanded && setIsLibraryOpen(!isLibraryOpen)}
                        className={cn(
                            "w-full flex items-center h-12 px-4 transition-colors text-zinc-400 hover:text-foreground hover:bg-zinc-800/30",
                            isExpanded ? "justify-start gap-3" : "justify-center",
                            (pathname === "/library" || pathname === "/library/reading" || pathname === "/library/completed") && "text-foreground bg-zinc-800/50 border-l-4 border-primary"
                        )}
                    >
                        <div className="relative flex-shrink-0">
                            <Library className="size-5" />
                            {/* Badge for total items when collapsed */}
                            {!isExpanded && isLoaded && totalLibraryItems > 0 && (
                                <span className="absolute -top-1.5 -right-1.5 min-w-[16px] h-4 flex items-center justify-center bg-primary text-primary-foreground text-[10px] font-bold rounded-full px-1">
                                    {totalLibraryItems > 9 ? "9+" : totalLibraryItems}
                                </span>
                            )}
                        </div>
                        <span
                            className={cn(
                                "text-sm font-medium transition-opacity whitespace-nowrap flex-1 text-left",
                                isExpanded ? "opacity-100" : "opacity-0 w-0"
                            )}
                        >
                            My Library
                        </span>
                        {isExpanded && isLoaded && totalLibraryItems > 0 && (
                            <ChevronDown
                                className={cn(
                                    "size-4 transition-transform",
                                    isLibraryOpen && "rotate-180"
                                )}
                            />
                        )}
                    </button>

                    {/* Library Sub-items (only when expanded and open) */}
                    {isExpanded && isLibraryOpen && isLoaded && (
                        <div className="ml-4 space-y-1">
                            {/* My List */}
                            <Link
                                href="/library/my-list"
                                className={cn(
                                    "flex items-center h-10 px-4 transition-colors rounded-md",
                                    pathname === "/library/my-list"
                                        ? "text-foreground bg-zinc-800/50"
                                        : "text-zinc-500 hover:text-foreground hover:bg-zinc-800/30"
                                )}
                            >
                                <Plus className="size-4 mr-3 flex-shrink-0" />
                                <span className="text-sm whitespace-nowrap flex-1">My List</span>
                                {myListCount > 0 && (
                                    <span className="text-xs bg-zinc-700 text-zinc-300 px-1.5 py-0.5 rounded-full font-medium">
                                        {myListCount}
                                    </span>
                                )}
                            </Link>

                            {/* Continue Reading */}
                            <Link
                                href="/library/reading"
                                className={cn(
                                    "flex items-center h-10 px-4 transition-colors rounded-md",
                                    pathname === "/library/reading"
                                        ? "text-foreground bg-zinc-800/50"
                                        : "text-zinc-500 hover:text-foreground hover:bg-zinc-800/30"
                                )}
                            >
                                <BookMarked className="size-4 mr-3 flex-shrink-0" />
                                <span className="text-sm whitespace-nowrap flex-1">Continue Reading</span>
                                {inProgressCount > 0 && (
                                    <span className="text-xs bg-amber-500/20 text-amber-400 px-1.5 py-0.5 rounded-full font-medium">
                                        {inProgressCount}
                                    </span>
                                )}
                            </Link>

                            {/* Completed */}
                            <Link
                                href="/library/completed"
                                className={cn(
                                    "flex items-center h-10 px-4 transition-colors rounded-md",
                                    pathname === "/library/completed"
                                        ? "text-foreground bg-zinc-800/50"
                                        : "text-zinc-500 hover:text-foreground hover:bg-zinc-800/30"
                                )}
                            >
                                <CheckCircle2 className="size-4 mr-3 flex-shrink-0" />
                                <span className="text-sm whitespace-nowrap flex-1">Completed</span>
                                {completedCount > 0 && (
                                    <span className="text-xs bg-emerald-500/20 text-emerald-400 px-1.5 py-0.5 rounded-full font-medium">
                                        {completedCount}
                                    </span>
                                )}
                            </Link>
                        </div>
                    )}
                </div>
            </nav>

            {/* Sign In / User Profile */}
            {!user ? (
                <div className="p-4 border-t border-zinc-800/50">
                    <Link
                        href="/login"
                        className={cn(
                            "flex items-center h-10 rounded-md bg-primary text-primary-foreground font-medium transition-colors hover:bg-primary/90",
                            isExpanded ? "justify-center px-4" : "justify-center w-10 mx-auto"
                        )}
                    >
                        {isExpanded ? "Sign In" : "→"}
                    </Link>
                </div>
            ) : (
                <div className="p-4 border-t border-zinc-800/50">
                    <Link
                        href="/profile"
                        className={cn(
                            "flex items-center gap-3 p-2 rounded-md hover:bg-zinc-800/50 transition-colors group",
                            isExpanded ? "justify-start" : "justify-center"
                        )}
                    >
                        <div className="size-8 rounded-full bg-zinc-700 flex items-center justify-center overflow-hidden border border-zinc-600 flex-shrink-0">
                            {user.user_metadata?.avatar_url ? (
                                <img
                                    src={user.user_metadata.avatar_url}
                                    alt={user.user_metadata.full_name || "User"}
                                    className="h-full w-full object-cover"
                                />
                            ) : (
                                <span className="text-xs font-medium text-zinc-300">
                                    {(user.email?.[0] || "U").toUpperCase()}
                                </span>
                            )}
                        </div>

                        <div
                            className={cn(
                                "flex flex-col overflow-hidden transition-all duration-300",
                                isExpanded ? "opacity-100 flex-1" : "opacity-0 w-0 hidden"
                            )}
                        >
                            <span className="text-sm font-medium text-foreground truncate">
                                {user.user_metadata?.full_name || "My Profile"}
                            </span>
                            <span className="text-xs text-muted-foreground truncate">
                                View Account
                            </span>
                        </div>
                    </Link>
                </div>
            )}
        </aside>
    );
}
