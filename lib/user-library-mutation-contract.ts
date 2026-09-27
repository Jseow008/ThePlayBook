export type LibraryBoundary = { resetEpoch: number; libraryRevision: number };
export type LibraryGuestImport = { migrationId: string; guestStorageId: string; sourceRecordId: string };
export type LibraryMutationInput = {
    baseRevision: number; resetEpoch: number; contentId: string; isBookmarked: boolean;
    progress: unknown | null; lastInteractedAt: string; deleteIfEmpty: boolean;
    mutationId?: string; createdAt?: string; guestImport?: LibraryGuestImport;
};
export type LibraryMutationAcknowledgement = LibraryBoundary & {
    outcome?: "applied" | "skipped";
    reason?: "destination_exists" | "source_already_imported";
};
export const LIBRARY_MUTATION_MAX_BYTES = 64 * 1024;
export class LibraryMutationReceiptError extends Error {
    constructor(readonly code: "LIBRARY_MUTATION_ID_REUSED" | "LIBRARY_RECEIPT_LIMIT" | "VALIDATION_ERROR", message: string) {
        super(message);
        this.name = "LibraryMutationReceiptError";
    }
}
export class LibraryMutationConflictError extends Error {
    constructor(readonly current?: LibraryBoundary) {
        super("Your library changed. Refresh it before saving this change again.");
        this.name = "LibraryMutationConflictError";
    }
}
