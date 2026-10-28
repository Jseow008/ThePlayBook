"use client";

import { useSyncExternalStore } from "react";
import { useAuthUser } from "@/hooks/useAuthUser";
import { getStorageScope, readerSettingsKey } from "@/lib/local-user-storage";
import type { ReaderTheme } from "@/hooks/useReaderSettings";

function subscribe(onChange: () => void) {
    window.addEventListener("storage", onChange);
    return () => window.removeEventListener("storage", onChange);
}

const serverTheme = (): ReaderTheme => "dark";

// Loading presentation only: never initialize settings synchronization or write
// preferences. An unresolved account must not borrow another account's theme.
export function useCachedReaderTheme(): ReaderTheme {
    const user = useAuthUser();
    return useSyncExternalStore(subscribe, () => {
        if (user === undefined) return "dark";
        try {
            const raw = localStorage.getItem(readerSettingsKey(getStorageScope(user?.id)));
            const theme: unknown = raw ? JSON.parse(raw)?.state?.readerTheme : undefined;
            return theme === "light" || theme === "sepia" ? theme : "dark";
        } catch {
            return "dark";
        }
    }, serverTheme);
}
