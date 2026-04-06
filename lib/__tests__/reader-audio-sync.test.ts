import { describe, expect, it } from "vitest";
import { findSegmentIdForPlaybackTime } from "@/lib/reader-audio-sync";

describe("reader audio sync", () => {
    const segments = [
        { id: "seg-1", order_index: 0, start_time_sec: 0, end_time_sec: 30 },
        { id: "seg-2", order_index: 1, start_time_sec: 30, end_time_sec: 60 },
        { id: "seg-3", order_index: 2, start_time_sec: 60, end_time_sec: 90 },
    ];

    it("returns the active segment for a playback time inside a timed range", () => {
        expect(findSegmentIdForPlaybackTime(segments, 12)).toBe("seg-1");
        expect(findSegmentIdForPlaybackTime(segments, 35)).toBe("seg-2");
    });

    it("uses the next segment boundary when timings meet at the same second", () => {
        expect(findSegmentIdForPlaybackTime(segments, 30)).toBe("seg-2");
        expect(findSegmentIdForPlaybackTime(segments, 60)).toBe("seg-3");
    });

    it("returns null when playback time lands inside an untimed gap", () => {
        expect(findSegmentIdForPlaybackTime([
            { id: "seg-1", order_index: 0, start_time_sec: 0, end_time_sec: 10 },
            { id: "seg-2", order_index: 1, start_time_sec: 15, end_time_sec: 30 },
        ], 12)).toBeNull();
    });

    it("returns null when no segment timings are available yet", () => {
        expect(findSegmentIdForPlaybackTime([
            { id: "seg-1", order_index: 0, start_time_sec: null, end_time_sec: null },
        ], 10)).toBeNull();
    });
});
