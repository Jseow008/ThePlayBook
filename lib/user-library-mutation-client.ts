"use client";

import type { Json } from "@/types/database";

export type UserLibraryMutationAcknowledgement = {
    resetEpoch: number;
    libraryRevision: number;
};

export async function commitUserLibraryMutation(input: {
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
    const payload = await response.json().catch(() => null) as { data?: UserLibraryMutationAcknowledgement; error?: { message?: string } } | null;
    if (!response.ok || !payload?.data) {
        throw new Error(payload?.error?.message ?? "Could not commit your library change.");
    }
    return payload.data;
}
