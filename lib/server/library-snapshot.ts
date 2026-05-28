export type LibraryItemRow = {
    content_id: string;
    is_bookmarked: boolean | null;
    progress: { isCompleted?: boolean; lastReadAt?: string | null } | null;
    last_interacted_at: string | null;
    content_item:
        | { title: string | null; author: string | null; category?: string | null }
        | Array<{ title: string | null; author: string | null; category?: string | null }>
        | null;
};

export type LibraryItemStatus = "completed" | "in progress" | "saved but not started" | "saved";

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

export function getLibraryItemStatus(row: LibraryItemRow): LibraryItemStatus {
    if (row.progress?.isCompleted) {
        return "completed";
    }

    if (row.progress) {
        return "in progress";
    }

    if (row.is_bookmarked) {
        return "saved but not started";
    }

    return "saved";
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
    const rowsByStatus = rows.reduce<Record<LibraryItemStatus, LibraryItemRow[]>>(
        (accumulator, row) => {
            accumulator[getLibraryItemStatus(row)].push(row);
            return accumulator;
        },
        {
            completed: [],
            "in progress": [],
            "saved but not started": [],
            saved: [],
        }
    );
    const categoryNames = Array.from(
        new Set(
            rows
                .map((row) => getRelation(row.content_item)?.category?.trim())
                .filter((category): category is string => Boolean(category))
        )
    );
    const summaryLines = [
        `Total library items: ${snapshot.totalItems}`,
        `Completed items: ${snapshot.completedCount}`,
        `In-progress items: ${snapshot.inProgressCount}`,
        `Saved but not started: ${snapshot.savedButNotStartedCount}`,
        `Authors represented: ${snapshot.authorNames.length ? snapshot.authorNames.join(", ") : "Unknown"}`,
        `Categories represented: ${categoryNames.length ? categoryNames.join(", ") : "Unknown"}`,
        `Completed basis: ${formatCompactItemList(rowsByStatus.completed, 12)}`,
        `Eligible next-read candidates: ${formatCompactItemList([...rowsByStatus["in progress"], ...rowsByStatus["saved but not started"], ...rowsByStatus.saved], 16)}`,
        "Library items:",
    ];

    const itemLines = rows.map((row, index) => {
        const contentItem = getRelation(row.content_item);
        const title = contentItem?.title?.trim() || "Untitled content";
        const author = contentItem?.author?.trim();
        const category = contentItem?.category?.trim();
        const status = getLibraryItemStatus(row);
        const lastReadAt = row.progress?.lastReadAt || row.last_interacted_at;
        const lastTouched = lastReadAt ? `last touched ${new Date(lastReadAt).toISOString().slice(0, 10)}` : null;

        return [
            `${index + 1}. ${title}${author ? ` — ${author}` : ""}`,
            `[${status}${category ? `; ${category}` : ""}${lastTouched ? `; ${lastTouched}` : ""}]`,
        ].join(" ");
    });

    const combined = [...summaryLines, ...itemLines].join("\n");
    return combined.length > maxChars ? combined.slice(0, maxChars) : combined;
}

function formatCompactItemList(rows: LibraryItemRow[], limit: number): string {
    if (rows.length === 0) {
        return "None listed";
    }

    const items = rows.slice(0, limit).map((row) => {
        const contentItem = getRelation(row.content_item);
        const title = contentItem?.title?.trim() || "Untitled content";
        const author = contentItem?.author?.trim();
        return `${title}${author ? ` — ${author}` : ""}`;
    });

    const remainingCount = rows.length - items.length;
    return remainingCount > 0 ? `${items.join("; ")}; plus ${remainingCount} more` : items.join("; ");
}
