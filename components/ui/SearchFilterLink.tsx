"use client";

import { Loader2 } from "lucide-react";
import Link, { useLinkStatus } from "next/link";
import type { ComponentProps, ReactNode } from "react";
import { beginSearchJourney } from "@/lib/search-journey-measurement";

function PendingIndicator() {
    const { pending } = useLinkStatus();

    return (
        <span
            aria-hidden="true"
            className={`pointer-events-none absolute -right-1 -top-1 flex size-4 items-center justify-center rounded-full border border-border bg-background text-foreground transition-opacity ${pending ? "opacity-100" : "opacity-0"}`}
        >
            <Loader2 className="size-3 motion-safe:animate-spin" />
        </span>
    );
}

export function SearchFilterLink({
    children,
    className,
    href,
    onNavigate,
    ...props
}: ComponentProps<typeof Link> & { children: ReactNode }) {
    return (
        <Link
            {...props}
            href={href}
            onNavigate={(event) => {
                if (typeof href === "string") beginSearchJourney(href, "filter", "link");
                onNavigate?.(event);
            }}
            className={`relative ${className ?? ""}`}
        >
            {children}
            <PendingIndicator />
        </Link>
    );
}
