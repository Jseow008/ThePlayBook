"use client";

import { useSyncExternalStore, type ComponentPropsWithoutRef, type ReactNode } from "react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { buildLoginHref, isPublicSummaryPath } from "@/lib/auth-redirect";

type SignInLinkProps = Omit<ComponentPropsWithoutRef<typeof Link>, "href"> & {
    children: ReactNode;
};

function subscribeToLocationHash(onChange: () => void) {
    window.addEventListener("hashchange", onChange);
    window.addEventListener("popstate", onChange);
    return () => {
        window.removeEventListener("hashchange", onChange);
        window.removeEventListener("popstate", onChange);
    };
}

export function SignInLink({ children, ...props }: SignInLinkProps) {
    const pathname = usePathname();
    const searchParams = useSearchParams();
    const search = searchParams.toString();
    const currentPath = search ? `${pathname}?${search}` : pathname;
    const hash = useSyncExternalStore(subscribeToLocationHash, () => window.location.hash, () => "");

    return (
        <Link
            {...props}
            href={buildLoginHref(isPublicSummaryPath(pathname) ? currentPath + hash : currentPath)}
        >
            {children}
        </Link>
    );
}
