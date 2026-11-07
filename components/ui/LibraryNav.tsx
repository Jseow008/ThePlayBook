"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const libraryNavItems = [
    { label: "Saved", href: "/library/my-list" },
    { label: "Continue Reading", href: "/library/reading" },
    { label: "Completed", href: "/library/completed" },
];

export function LibraryNav() {
    const pathname = usePathname();

    // Compact spacing starts below 360px at the default font size and scales with larger text.
    return (
        <div className="@container/library-nav lg:hidden sticky top-0 z-40 bg-background border-b border-border/70">
            <div className="flex min-h-12 flex-wrap items-center gap-x-2 gap-y-3 px-4 py-2 @max-[22.5em]/library-nav:gap-x-1.5 @max-[22.5em]/library-nav:px-3">
                {libraryNavItems.map((item) => {
                    const isActive = pathname === item.href;
                    return (
                        <Link
                            key={item.href}
                            href={item.href}
                            className={cn(
                                "touch-target-44 min-w-11 max-w-full break-words rounded-full px-4 py-1.5 text-center text-sm font-medium transition-colors @max-[22.5em]/library-nav:px-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
                                // Grow to the full label when there is room, with its longest word as the wrapping basis.
                                item.href === "/library/reading" ? "flex-[1_1_min-content] max-w-max" : "flex-none",
                                isActive
                                    ? "bg-primary text-primary-foreground shadow-sm"
                                    : "text-muted-foreground hover:text-foreground hover:bg-secondary/60"
                            )}
                            aria-current={isActive ? "page" : undefined}
                        >
                            {item.label}
                        </Link>
                    );
                })}
            </div>
        </div>
    );
}
