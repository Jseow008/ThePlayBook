"use client";

import { LibraryMutationConflictError, LibraryMutationReceiptError, type LibraryBoundary, type LibraryMutationInput, type LibraryMutationAcknowledgement } from "@/lib/user-library-mutation-contract";

export type UserLibraryMutationAcknowledgement = LibraryMutationAcknowledgement;

export async function commitUserLibraryMutation(input: LibraryMutationInput & {
    expectedAccountId: string;
}, signal?: AbortSignal): Promise<UserLibraryMutationAcknowledgement> {
    const response = await fetch("/api/account-data/user_library/mutation", {
        method: "POST",
        signal,
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify(input),
    });
    const payload = await response.json().catch(() => null) as { data?: UserLibraryMutationAcknowledgement; error?: { message?: string; code?: string; current?: LibraryBoundary } } | null;
    if (response.status === 409 && payload?.error?.code === "LIBRARY_CONFLICT") {
        throw new LibraryMutationConflictError(payload.error.current);
    }
    if (payload?.error?.code && ["LIBRARY_MUTATION_ID_REUSED", "LIBRARY_RECEIPT_LIMIT", "VALIDATION_ERROR"].includes(payload.error.code)) {
        throw new LibraryMutationReceiptError(payload.error.code as "LIBRARY_MUTATION_ID_REUSED" | "LIBRARY_RECEIPT_LIMIT" | "VALIDATION_ERROR", payload.error.message ?? "This change needs review.");
    }
    if (!response.ok || !payload?.data) {
        throw new Error(payload?.error?.message ?? "Could not commit your library change.");
    }
    return payload.data;
}
