export type LibraryBoundary = { resetEpoch: number; libraryRevision: number };

export class LibraryMutationConflictError extends Error {
    constructor(readonly current?: LibraryBoundary) {
        super("Your library changed. Refresh it before saving this change again.");
        this.name = "LibraryMutationConflictError";
    }
}
