"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
    BooksIcon,
    FrameCornersIcon,
    HouseIcon,
    MagnifyingGlassIcon,
    NotepadIcon,
} from "@phosphor-icons/react";
import { cn } from "@/lib/utils";
import { useReadingProgress } from "@/hooks/useReadingProgress";

/**
 * Mobile Bottom Navigation
 * 
 * Provides quick access to main sections on mobile devices.
 * Inspired by streaming app mobile navigation patterns.
 */

const navItems = [
    { icon: HouseIcon, label: "Browse", href: "/browse" },
    { icon: MagnifyingGlassIcon, label: "Search", href: "/search" },
    { icon: FrameCornersIcon, label: "Focus", href: "/focus" },
    { icon: NotepadIcon, label: "Notes", href: "/notes" },
    { icon: BooksIcon, label: "Library", href: "/library/my-list" },
];

export function MobileBottomNav({ compact = false }: { compact?: boolean }) {
    const pathname = usePathname();
    const { totalLibraryItems, isLoaded } = useReadingProgress();

    // Check if current path is in library section
    const isLibraryActive = pathname.startsWith("/library");
    const isFocusActive = pathname === "/focus";

    return (
        <nav
            data-testid="mobile-bottom-nav"
            className="fixed inset-x-0 z-50 px-3 safe-area-bottom-sm lg:hidden"
        >
            <div className={cn(
                "mx-auto flex w-full max-w-md items-center justify-center",
                compact ? "mobile-bottom-nav-compact-height" : "mobile-bottom-nav-height"
            )}>
                <div className={cn(
                    "grid w-full grid-cols-5 items-center gap-1 rounded-full border border-white/10 bg-zinc-950/90 p-1 shadow-[0_18px_48px_-20px_rgba(0,0,0,0.9)] backdrop-blur-xl",
                    compact ? "h-16" : "h-[4.25rem]"
                )}>
                    {navItems.map((item) => {
                        const isActive = item.href === "/library/my-list"
                            ? isLibraryActive
                            : item.href === "/focus"
                                ? isFocusActive
                                : pathname === item.href;
                        const isLibrary = item.href === "/library/my-list";

                        return (
                            <Link
                                key={item.href}
                                href={item.href}
                                aria-current={isActive ? "page" : undefined}
                                className={cn(
                                    "focus-ring relative flex h-full min-w-0 flex-col items-center justify-center gap-1 rounded-full px-1 transition-[background-color,color,box-shadow] duration-200",
                                    isActive
                                        ? "bg-white/[0.14] text-foreground shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]"
                                        : "text-muted-foreground hover:bg-white/[0.06] hover:text-foreground"
                                )}
                            >
                                <div className="relative">
                                    <item.icon className="size-6" weight={isActive ? "fill" : "regular"} />
                                    {/* Badge for library items */}
                                    {isLibrary && isLoaded && totalLibraryItems > 0 && (
                                        <span className="absolute -right-2 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-bold text-primary-foreground">
                                            {totalLibraryItems > 9 ? "9+" : totalLibraryItems}
                                        </span>
                                    )}
                                </div>
                                <span className="max-w-full truncate text-[11px] font-medium leading-none">
                                    {item.label}
                                </span>
                            </Link>
                        );
                    })}
                </div>
            </div>
        </nav>
    );
}
