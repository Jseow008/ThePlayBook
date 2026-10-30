"use client";

import type { ReactNode } from "react";
import { useCachedReaderTheme } from "@/hooks/useCachedReaderTheme";

export function PreviewLoadingAppearance({ children }: { children: ReactNode }) {
    const readerTheme = useCachedReaderTheme();
    return (
        <div
            data-testid="preview-loading-state"
            role="status"
            aria-label="Loading preview"
            aria-busy="true"
            className={`min-h-screen bg-background pb-[calc(5.75rem+var(--safe-area-bottom))] text-foreground reader-${readerTheme} sm:pb-10 lg:pb-8`}
        >
            {children}
        </div>
    );
}
