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
        <div className="lg:hidden sticky top-0 z-30 bg-background/95 backdrop-blur-md border-b border-border overflow-x-auto scrollbar-hide">
            <div className="flex items-center px-4 h-12 gap-2 min-w-max">
                {libraryNavItems.map((item) => {
                    const isActive = pathname === item.href;
                    return (
                        <Link
                            key={item.href}
                            href={item.href}
                            className={cn(
                                "px-4 py-1.5 rounded-full text-sm font-medium transition-colors whitespace-nowrap",
                                isActive
                                    ? "bg-primary text-primary-foreground"
                                    : "text-muted-foreground hover:text-foreground hover:bg-secondary/50"
                            )}
                        >
                            {item.label}
                        </Link>
                    );
                })}
            </div>
        </div>
    );
}
