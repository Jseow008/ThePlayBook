import type { ReadingProgressData } from "@/hooks/useReadingProgress";
import { GUEST_STORAGE_SCOPE, progressKey } from "@/lib/local-user-storage";

export function readGuestProgress(
    storage: Storage,
    contentId: string,
    segmentIds: string[]
): ReadingProgressData | null {
    try {
        const raw = storage.getItem(progressKey(GUEST_STORAGE_SCOPE, contentId));
        if (!raw) return null;
        const saved = JSON.parse(raw) as Partial<ReadingProgressData>;
        if (saved.itemId !== contentId || !Array.isArray(saved.completed)
            || !saved.completed.every((id) => typeof id === "string")
            || typeof saved.lastReadAt !== "string"
            || !Number.isFinite(Date.parse(saved.lastReadAt))) return null;

        const completedSet = new Set(saved.completed);
        const completed = segmentIds.filter((id) => completedSet.has(id));
        const furthestCompleted = segmentIds.reduce(
            (last, id, index) => completedSet.has(id) ? index : last,
            -1
        );
        const savedMaxIndex = typeof saved.maxSegmentIndex === "number" && Number.isFinite(saved.maxSegmentIndex)
            ? Math.floor(saved.maxSegmentIndex) : -1;
        const savedLastIndex = typeof saved.lastSegmentIndex === "number" && Number.isFinite(saved.lastSegmentIndex)
            ? Math.floor(saved.lastSegmentIndex) : -1;
        const lastSegmentIndex = Math.min(segmentIds.length - 1, Math.max(
            -1,
            furthestCompleted,
            savedMaxIndex,
            savedLastIndex
        ));
        const isCompleted = segmentIds.length > 0 && completed.length === segmentIds.length;

        return {
            itemId: contentId,
            completed,
            lastSegmentIndex,
            maxSegmentIndex: lastSegmentIndex,
            lastReadAt: saved.lastReadAt,
            isCompleted,
            totalSegments: segmentIds.length,
            ...(isCompleted && typeof saved.completedAt === "string" && Number.isFinite(Date.parse(saved.completedAt))
                ? { completedAt: saved.completedAt } : {}),
        };
    } catch {
        return null;
    }
}

export function combineReadingProgress(
    guest: ReadingProgressData,
    account: ReadingProgressData | null,
    segmentIds: string[]
): ReadingProgressData {
    const knownCompleted = new Set([...(guest.completed ?? []), ...(account?.completed ?? [])]);
    const completed = segmentIds.filter((id) => knownCompleted.has(id));
    const furthestCompleted = segmentIds.reduce(
        (last, id, index) => knownCompleted.has(id) ? index : last,
        -1
    );
    const lastSegmentIndex = Math.min(segmentIds.length - 1, Math.max(
        -1,
        furthestCompleted,
        guest.maxSegmentIndex ?? guest.lastSegmentIndex,
        account?.maxSegmentIndex ?? account?.lastSegmentIndex ?? -1
    ));
    const isCompleted = segmentIds.length > 0 && completed.length === segmentIds.length;

    return {
        itemId: guest.itemId,
        completed,
        lastSegmentIndex,
        maxSegmentIndex: lastSegmentIndex,
        lastReadAt: new Date().toISOString(),
        isCompleted,
        totalSegments: segmentIds.length,
        ...(isCompleted ? { completedAt: account?.completedAt ?? guest.completedAt ?? new Date().toISOString() } : {}),
    };
}
