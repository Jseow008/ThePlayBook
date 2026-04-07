type TimedSegmentLike = {
    id: string;
    order_index: number;
    start_time_sec: number | null;
    end_time_sec: number | null;
};

export function findSegmentIdForPlaybackTime(
    segments: TimedSegmentLike[],
    currentTimeSec: number
) {
    const timedSegments = segments
        .filter(
            (segment) =>
                typeof segment.start_time_sec === "number"
                && (
                    segment.end_time_sec === null
                    || typeof segment.end_time_sec === "number"
                )
        )
        .sort((a, b) => {
            if ((a.start_time_sec as number) !== (b.start_time_sec as number)) {
                return (a.start_time_sec as number) - (b.start_time_sec as number);
            }

            return a.order_index - b.order_index;
        });

    if (timedSegments.length === 0) {
        return null;
    }

    for (const segment of timedSegments) {
        const startTime = segment.start_time_sec as number;
        const endTime = segment.end_time_sec;

        if (typeof endTime === "number") {
            if (currentTimeSec >= startTime && currentTimeSec < endTime) {
                return segment.id;
            }
            continue;
        }

        if (currentTimeSec >= startTime) {
            return segment.id;
        }
    }

    return null;
}

export function findCompletedSegmentIdsForPlaybackTime(
    segments: TimedSegmentLike[],
    currentTimeSec: number
) {
    return segments
        .filter(
            (segment) =>
                typeof segment.end_time_sec === "number"
                && currentTimeSec >= segment.end_time_sec
        )
        .sort((a, b) => a.order_index - b.order_index)
        .map((segment) => segment.id);
}
