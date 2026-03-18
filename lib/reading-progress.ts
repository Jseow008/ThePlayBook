export interface ReadingProgressData {
    itemId: string;
    completed: string[];
    lastSegmentIndex: number;
    lastReadAt: string;
    isCompleted: boolean;
    totalSegments?: number;
    maxSegmentIndex?: number;
}

interface NormalizeReadingProgressOptions {
    progress: Partial<ReadingProgressData>;
    itemId: string;
    totalSegments: number;
    validSegmentIds: Iterable<string>;
}

interface NormalizeReadingProgressResult {
    progress: ReadingProgressData;
    didChange: boolean;
}

function clampSegmentIndex(value: unknown, totalSegments: number) {
    if (typeof value !== "number" || Number.isNaN(value)) {
        return -1;
    }

    const upperBound = Math.max(totalSegments - 1, -1);
    return Math.min(Math.max(Math.trunc(value), -1), upperBound);
}

function areStringArraysEqual(left: string[], right: string[]) {
    if (left.length !== right.length) {
        return false;
    }

    return left.every((value, index) => value === right[index]);
}

export function clampReadingProgressPercent(completedCount: number, totalSegments: number) {
    if (totalSegments <= 0) {
        return 0;
    }

    const rawPercent = Math.round((completedCount / totalSegments) * 100);
    return Math.min(100, Math.max(0, rawPercent));
}

export function normalizeReadingProgress({
    progress,
    itemId,
    totalSegments,
    validSegmentIds,
}: NormalizeReadingProgressOptions): NormalizeReadingProgressResult {
    const segmentIds = new Set(validSegmentIds);
    const completedSource = Array.isArray(progress.completed) ? progress.completed : [];
    const completedSeen = new Set<string>();
    const completed = completedSource.filter((segmentId): segmentId is string => {
        if (typeof segmentId !== "string") {
            return false;
        }

        if (!segmentIds.has(segmentId) || completedSeen.has(segmentId)) {
            return false;
        }

        completedSeen.add(segmentId);
        return true;
    });
    const normalizedLastSegmentIndex = clampSegmentIndex(progress.lastSegmentIndex, totalSegments);
    const maxSegmentIndexSource =
        typeof progress.maxSegmentIndex === "number" && !Number.isNaN(progress.maxSegmentIndex)
            ? progress.maxSegmentIndex
            : progress.lastSegmentIndex;

    const normalizedProgress: ReadingProgressData = {
        itemId,
        completed,
        lastSegmentIndex: normalizedLastSegmentIndex,
        lastReadAt: typeof progress.lastReadAt === "string" ? progress.lastReadAt : "",
        isCompleted: totalSegments > 0 && completed.length >= totalSegments,
        totalSegments,
        maxSegmentIndex: clampSegmentIndex(maxSegmentIndexSource, totalSegments),
    };

    const didChange =
        progress.itemId !== normalizedProgress.itemId ||
        !areStringArraysEqual(completedSource, normalizedProgress.completed) ||
        progress.lastSegmentIndex !== normalizedProgress.lastSegmentIndex ||
        progress.maxSegmentIndex !== normalizedProgress.maxSegmentIndex ||
        progress.lastReadAt !== normalizedProgress.lastReadAt ||
        progress.isCompleted !== normalizedProgress.isCompleted ||
        progress.totalSegments !== normalizedProgress.totalSegments;

    return {
        progress: normalizedProgress,
        didChange,
    };
}
