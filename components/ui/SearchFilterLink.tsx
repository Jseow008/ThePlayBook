"use client";

import { Loader2 } from "lucide-react";
import Link, { useLinkStatus } from "next/link";
import type { ComponentProps, ReactNode } from "react";

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
    ...props
}: ComponentProps<typeof Link> & { children: ReactNode }) {
    return (
        <Link {...props} className={`relative ${className ?? ""}`}>
            {children}
            <PendingIndicator />
        </Link>
    );
}
