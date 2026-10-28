"use client";

import type { ReactNode } from "react";
import { useCachedReaderTheme } from "@/hooks/useCachedReaderTheme";

export function ReaderLoadingAppearance({ children }: { children: ReactNode }) {
    const readerTheme = useCachedReaderTheme();
    return (
        <div
            data-testid="reader-loading-state"
            role="status"
            aria-label="Loading reader"
            aria-busy="true"
            className={`min-h-screen bg-background font-sans text-foreground reader-${readerTheme}`}
        >
            {children}
        </div>
    );
}
