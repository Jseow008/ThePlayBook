"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
    Home,
    Search,
    Library,
    LayoutGrid,
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
    { icon: Home, label: "Home", href: "/" },
    { icon: Search, label: "Search", href: "/search" },
    { icon: LayoutGrid, label: "Categories", href: "/categories" },
    { icon: Library, label: "My Library", href: "/library/my-list" },
];

export function MobileBottomNav() {
    const pathname = usePathname();
    const { totalLibraryItems, isLoaded } = useReadingProgress();

    // Check if current path is in library section
    const isLibraryActive = pathname.startsWith("/library");

    return (
        <nav className="lg:hidden fixed bottom-0 left-0 right-0 z-50 bg-background/95 backdrop-blur-md border-t border-border safe-area-pb">
            <div className="flex items-center justify-around h-16">
                {navItems.map((item) => {
                    const isActive = item.href === "/library/my-list"
                        ? isLibraryActive
                        : pathname === item.href;
                    const isLibrary = item.href === "/library/my-list";

                    return (
                        <Link
                            key={item.href}
                            href={item.href}
                            className={cn(
                                "flex flex-col items-center justify-center gap-1 px-4 py-2 min-w-[64px] transition-colors focus-ring rounded-md",
                                isActive
                                    ? "text-foreground"
                                    : "text-muted-foreground"
                            )}
                        >
                            <div className="relative">
                                <item.icon className={cn(
                                    "size-5",
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
                                "text-[10px] font-medium",
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
