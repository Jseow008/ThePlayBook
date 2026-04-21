"use client";

import type { ComponentPropsWithoutRef, ReactNode } from "react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { buildLoginHref } from "@/lib/auth-redirect";

type SignInLinkProps = Omit<ComponentPropsWithoutRef<typeof Link>, "href"> & {
    children: ReactNode;
};

export function SignInLink({ children, ...props }: SignInLinkProps) {
    const pathname = usePathname();
    const searchParams = useSearchParams();
    const search = searchParams.toString();
    const currentPath = search ? `${pathname}?${search}` : pathname;

    return (
        <Link
            {...props}
            href={buildLoginHref(currentPath)}
        >
            {children}
        </Link>
    );
}
