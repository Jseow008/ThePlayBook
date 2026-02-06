"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
    Search,
    Home,
    Shuffle,
    BookOpen,
} from "lucide-react";
import { cn } from "@/lib/utils";

const navItems = [
    { icon: Search, label: "Search", href: "/search" },
    { icon: Home, label: "Home", href: "/" },
    { icon: Shuffle, label: "Surprise Me", href: "/random" },
];

export function NetflixSidebar() {
    const pathname = usePathname();
    const [isExpanded, setIsExpanded] = useState(false);

    return (
        <aside
            onMouseEnter={() => setIsExpanded(true)}
            onMouseLeave={() => setIsExpanded(false)}
            className={cn(
                "fixed left-0 top-0 bottom-0 z-50 bg-black/95 backdrop-blur-md border-r border-zinc-800/50 transition-all duration-300 hidden lg:flex flex-col",
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
            </nav>

            {/* Sign In */}
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
        </aside>
    );
}
