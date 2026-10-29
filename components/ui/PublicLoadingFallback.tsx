"use client";

import type { ReactNode } from "react";
import { usePathname } from "next/navigation";

// The shared boundary can render before the destination's nested loading
// boundary is available. Keep that first frame shaped like the destination.
export function PublicLoadingFallback({
    children,
    preview,
}: {
    children: ReactNode;
    preview: ReactNode;
}) {
    const pathname = usePathname();
    return pathname?.startsWith("/preview/") ? preview : children;
}
