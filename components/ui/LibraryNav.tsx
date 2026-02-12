"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const libraryNavItems = [
    { label: "My List", href: "/library/my-list" },
    { label: "Continue Reading", href: "/library/reading" },
    { label: "Completed", href: "/library/completed" },
];

export function LibraryNav() {
    const pathname = usePathname();

    return (
        <div className="lg:hidden sticky top-0 z-30 bg-background/90 backdrop-blur-md border-b border-border/70 overflow-x-auto scrollbar-hide">
            <div className="flex items-center px-4 h-12 gap-2 min-w-max">
                {libraryNavItems.map((item) => {
                    const isActive = pathname === item.href;
                    return (
                        <Link
                            key={item.href}
                            href={item.href}
                            className={cn(
                                "px-4 py-1.5 rounded-full text-sm font-medium transition-all whitespace-nowrap focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
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
