"use client";

import { Suspense, type ComponentPropsWithoutRef } from "react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useAuthUser } from "@/hooks/useAuthUser";
import { buildLoginHref } from "@/lib/auth-redirect";

type Props = ComponentPropsWithoutRef<typeof Link> & { href: string };

function LinkFromSearch({ href, ...props }: Props) {
    const user = useAuthUser();
    const query = useSearchParams().toString();
    const searchPath = query ? `/search?${query}` : "/search";
    return <Link {...props} href={user ? href : buildLoginHref(href, searchPath)} />;
}

export function ProtectedNavLink(props: Props) {
    const pathname = usePathname();
    const link = <Link {...props} />;
    if (pathname !== "/search") return link;

    return (
        <Suspense fallback={link}>
            <LinkFromSearch {...props} />
        </Suspense>
    );
}
