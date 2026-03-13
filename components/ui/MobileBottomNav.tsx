"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
    Home,
    Search,
    Library,
    Sparkles,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useReadingProgress } from "@/hooks/useReadingProgress";

/**
 * Mobile Bottom Navigation
 * 
 * Provides quick access to main sections on mobile devices.
 * Inspired by Netflix/Spotify mobile navigation patterns.
 */

const navItems = [
    { icon: Home, label: "Home", href: "/browse" },
    { icon: Search, label: "Search", href: "/search" },
    { icon: Sparkles, label: "Ask", href: "/ask" },
    { icon: Library, label: "My Library", href: "/library/my-list" },
];

export function MobileBottomNav({ compact = false }: { compact?: boolean }) {
    const pathname = usePathname();
    const { totalLibraryItems, isLoaded } = useReadingProgress();

    // Check if current path is in library section
    const isLibraryActive = pathname.startsWith("/library");
    const isAskActive = pathname === "/ask";

    return (
        <nav className="lg:hidden fixed bottom-0 left-0 right-0 z-50 bg-background/95 backdrop-blur-md border-t border-border safe-area-pb">
            <div className={cn("flex items-center justify-around", compact ? "h-14" : "h-16")}>
                {navItems.map((item) => {
                    const isActive = item.href === "/library/my-list"
                        ? isLibraryActive
                        : item.href === "/ask"
                            ? isAskActive
                        : pathname === item.href;
                    const isLibrary = item.href === "/library/my-list";

                    return (
                        <Link
                            key={item.href}
                            href={item.href}
                            className={cn(
                                "flex flex-col items-center justify-center px-4 py-2 min-w-[64px] transition-colors focus-ring rounded-md",
                                compact ? "gap-0.5" : "gap-1",
                                isActive
                                    ? "text-foreground"
                                    : "text-muted-foreground"
                            )}
                        >
                            <div className="relative">
                                <item.icon className={cn(
                                    compact ? "size-[18px]" : "size-5",
                                    isActive && "text-primary"
                                )} />
                                {/* Badge for library items */}
                                {isLibrary && isLoaded && totalLibraryItems > 0 && (
                                    <span className="absolute -top-1 -right-2 min-w-[16px] h-4 flex items-center justify-center bg-primary text-primary-foreground text-[10px] font-bold rounded-full px-1">
                                        {totalLibraryItems > 9 ? "9+" : totalLibraryItems}
                                    </span>
                                )}
                            </div>
                            <span className={cn(
                                compact ? "text-[9px] font-medium" : "text-[10px] font-medium",
                                isActive ? "text-foreground" : "text-muted-foreground"
                            )}>
                                {item.label}
                            </span>
                        </Link>
                    );
                })}
            </div>
        </nav>
    );
}
