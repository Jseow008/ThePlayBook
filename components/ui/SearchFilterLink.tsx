"use client";

import { Loader2 } from "lucide-react";
import Link, { useLinkStatus } from "next/link";
import { useRouter } from "next/navigation";
import type { ComponentProps, ReactNode } from "react";
import { beginSearchJourney, resolveSearchFilterHref, type SearchFilterParam } from "@/lib/search-journey-measurement";

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
    filterParam,
    filterValue,
    onNavigate,
    ...props
}: Omit<ComponentProps<typeof Link>, "href"> & {
    children: ReactNode;
    href: string;
    filterParam: SearchFilterParam;
    filterValue?: string;
}) {
    const router = useRouter();
    const selectedFilterKind = filterParam === "category" ? "topic" : filterParam;

    return (
        <Link
            {...props}
            href={href}
            onNavigate={(event) => {
                const nextHref = resolveSearchFilterHref(href, filterParam, filterValue);
                beginSearchJourney(nextHref, "filter", "link", selectedFilterKind);
                if (nextHref !== href) {
                    event.preventDefault();
                    router.push(nextHref);
                }
                onNavigate?.(event);
            }}
            className={`relative ${className ?? ""}`}
        >
            {children}
            <PendingIndicator />
        </Link>
    );
}
