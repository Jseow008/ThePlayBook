"use client";

import { LibraryMutationConflictError, LibraryMutationReceiptError, type LibraryBoundary, type LibraryMutationInput, type LibraryMutationAcknowledgement } from "@/lib/user-library-mutation-contract";

export type UserLibraryMutationAcknowledgement = LibraryMutationAcknowledgement;

export async function commitUserLibraryMutation(input: LibraryMutationInput & {
    expectedAccountId: string;
}, signal?: AbortSignal, onRetry?: () => void): Promise<UserLibraryMutationAcknowledgement> {
    // Freeze the body: retries must retain the original identity, boundary and timestamp.
    const body = JSON.stringify(input);
    let response: Response;
    let payload: { data?: UserLibraryMutationAcknowledgement; error?: { message?: string; code?: string; current?: LibraryBoundary } } | null;
    for (let attempt = 0; ; attempt++) {
        signal?.throwIfAborted();
        response = await fetch("/api/account-data/user_library/mutation", {
            method: "POST", signal, headers: { "Content-Type": "application/json" },
            credentials: "same-origin", body,
        });
        payload = await response.json().catch(() => null);
        const retryable = (response.status === 429 && payload?.error?.code === "RATE_LIMITED")
            || (response.status === 503 && payload?.error?.code === "RATE_LIMIT_UNAVAILABLE");
        // Three automatic retries; after a sustained outage the durable journal remains pending.
        if (!retryable || attempt >= 3) break;
        const header = response.headers.get("Retry-After");
        const seconds = header && /^\d+$/.test(header) ? Number(header) : 60;
        // Do not retry earlier than an unexpectedly long server deadline.
        if (!Number.isFinite(seconds) || seconds > 3600) break;
        onRetry?.();
        await waitForRetry(Math.max(1, seconds) * 1000, signal);
    }
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

function waitForRetry(ms: number, signal?: AbortSignal): Promise<void> {
    return new Promise((resolve, reject) => {
        signal?.throwIfAborted();
        const abort = () => {
            clearTimeout(timer);
            reject(signal?.reason ?? new DOMException("Aborted", "AbortError"));
        };
        const timer = setTimeout(() => {
            signal?.removeEventListener("abort", abort);
            resolve();
        }, ms);
        signal?.addEventListener("abort", abort, { once: true });
    });
}
