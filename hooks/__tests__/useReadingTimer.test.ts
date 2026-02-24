// @vitest-environment jsdom
import { renderHook, act } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { useReadingTimer } from "../useReadingTimer";

describe("useReadingTimer", () => {
    beforeEach(() => {
        vi.useFakeTimers();
        global.fetch = vi.fn(() => Promise.resolve(new Response(null, { status: 200 })));
    });

    afterEach(() => {
        vi.useRealTimers();
        vi.restoreAllMocks();
    });

    it("increments secondsRead when document is visible", () => {
        // Mock visibilityState
        Object.defineProperty(document, "visibilityState", {
            configurable: true,
            get: () => "visible",
        });

        const { result } = renderHook(() => useReadingTimer("test-content-id"));

        expect(result.current.secondsRead).toBe(0);

        act(() => {
            vi.advanceTimersByTime(2000);
        });

        expect(result.current.secondsRead).toBe(2);
    });

    it("does not increment when document is hidden", () => {
        let isVisible = "hidden";
        Object.defineProperty(document, "visibilityState", {
            configurable: true,
            get: () => isVisible,
        });

        const { result } = renderHook(() => useReadingTimer("test-content-id"));

        act(() => {
            vi.advanceTimersByTime(2000);
        });

        expect(result.current.secondsRead).toBe(0);

        // Transition to visible
        isVisible = "visible";
        act(() => {
            document.dispatchEvent(new Event("visibilitychange"));
            vi.advanceTimersByTime(1000);
        });

        expect(result.current.secondsRead).toBe(1);
    });

    it("sends a heartbeat when timer stops and pending > 60s", async () => {
        Object.defineProperty(document, "visibilityState", {
            configurable: true,
            get: () => "visible",
        });

        const { unmount } = renderHook(() => useReadingTimer("test-content-id"));

        act(() => {
            vi.advanceTimersByTime(65 * 1000); // 65 seconds
        });

        // unmounting should trigger heartbeat
        act(() => {
            unmount();
        });

        expect(fetch).toHaveBeenCalledTimes(1);
        const fetchArgs = vi.mocked(fetch).mock.calls[0];
        expect(fetchArgs[0]).toBe("/api/activity/log");

        // We can parse the fetch body
        const reqOpts = fetchArgs[1];
        const bodyObj = JSON.parse(reqOpts?.body as string);

        expect(bodyObj.duration_seconds).toBe(65);
        expect(bodyObj.content_id).toBe("test-content-id");
    });

    it("does not send a heartbeat if pending < 60s", () => {
        Object.defineProperty(document, "visibilityState", {
            configurable: true,
            get: () => "visible",
        });

        const { unmount } = renderHook(() => useReadingTimer("test-content-id"));

        act(() => {
            vi.advanceTimersByTime(30 * 1000); // 30 seconds
        });

        // unmounting should NOT trigger heartbeat
        act(() => {
            unmount();
        });

        expect(fetch).not.toHaveBeenCalled();
    });
});
