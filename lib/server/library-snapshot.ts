export type LibraryItemRow = {
    content_id: string;
    is_bookmarked: boolean | null;
    progress: { isCompleted?: boolean; lastReadAt?: string | null } | null;
    last_interacted_at: string | null;
    content_item:
        | { title: string | null; author: string | null }
        | Array<{ title: string | null; author: string | null }>
        | null;
};

export type LibrarySnapshot = {
    totalItems: number;
    completedCount: number;
    inProgressCount: number;
    savedButNotStartedCount: number;
    authorNames: string[];
};

export function getRelation<T>(value: T | T[] | null): T | null {
    if (Array.isArray(value)) {
        return value[0] ?? null;
    }

    return value ?? null;
}

export function buildLibrarySnapshot(rows: LibraryItemRow[]): LibrarySnapshot {
    const completedCount = rows.filter((row) => row.progress?.isCompleted).length;
    const inProgressCount = rows.filter((row) => row.progress && !row.progress.isCompleted).length;
    const savedButNotStartedCount = rows.filter((row) => row.is_bookmarked && !row.progress).length;
    const authorNames = Array.from(
        new Set(
            rows
                .map((row) => getRelation(row.content_item)?.author?.trim())
                .filter((author): author is string => Boolean(author))
        )
    );

    return {
        totalItems: rows.length,
        completedCount,
        inProgressCount,
        savedButNotStartedCount,
        authorNames,
    };
}

export function buildLibraryMetadataContext(rows: LibraryItemRow[], maxChars: number): string {
    if (rows.length === 0) {
        return "No library metadata is available for this user yet.";
    }

    const snapshot = buildLibrarySnapshot(rows);
    const summaryLines = [
        `Total library items: ${snapshot.totalItems}`,
        `Completed books: ${snapshot.completedCount}`,
        `In-progress books: ${snapshot.inProgressCount}`,
        `Saved but not started: ${snapshot.savedButNotStartedCount}`,
        `Authors represented: ${snapshot.authorNames.length ? snapshot.authorNames.join(", ") : "Unknown"}`,
        "Library items:",
    ];

    const itemLines = rows.map((row, index) => {
        const contentItem = getRelation(row.content_item);
        const title = contentItem?.title?.trim() || "Untitled content";
        const author = contentItem?.author?.trim();
        const status = row.progress?.isCompleted
            ? "completed"
            : row.progress
                ? "in progress"
                : row.is_bookmarked
                    ? "saved but not started"
                    : "saved";
        const lastReadAt = row.progress?.lastReadAt || row.last_interacted_at;
        const lastTouched = lastReadAt ? `last touched ${new Date(lastReadAt).toISOString().slice(0, 10)}` : null;

        return [
            `${index + 1}. ${title}${author ? ` — ${author}` : ""}`,
            `[${status}${lastTouched ? `; ${lastTouched}` : ""}]`,
        ].join(" ");
    });

    const combined = [...summaryLines, ...itemLines].join("\n");
    return combined.length > maxChars ? combined.slice(0, maxChars) : combined;
}
