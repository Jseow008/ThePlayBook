"use client";

import { LibraryMutationConflictError, type LibraryBoundary } from "@/lib/user-library-mutation-contract";
import type { Json } from "@/types/database";

export type UserLibraryMutationAcknowledgement = {
    resetEpoch: number;
    libraryRevision: number;
};

export async function commitUserLibraryMutation(input: {
    expectedAccountId: string;
    baseRevision: number;
    resetEpoch: number;
    contentId: string;
    isBookmarked: boolean;
    progress: Json | null;
    lastInteractedAt: string;
    deleteIfEmpty: boolean;
}): Promise<UserLibraryMutationAcknowledgement> {
    const response = await fetch("/api/account-data/user_library/mutation", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify(input),
    });
    const payload = await response.json().catch(() => null) as { data?: UserLibraryMutationAcknowledgement; error?: { message?: string; code?: string; current?: LibraryBoundary } } | null;
    if (response.status === 409 && payload?.error?.code === "LIBRARY_CONFLICT") {
        throw new LibraryMutationConflictError(payload.error.current);
    }
    if (!response.ok || !payload?.data) {
        throw new Error(payload?.error?.message ?? "Could not commit your library change.");
    }
    return payload.data;
}
