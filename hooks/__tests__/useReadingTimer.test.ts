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

    it("flushes a full batch while the reader remains open", async () => {
        Object.defineProperty(document, "visibilityState", {
            configurable: true,
            get: () => "visible",
        });

        renderHook(() => useReadingTimer("test-content-id"));

        await act(async () => {
            vi.advanceTimersByTime(65 * 1000); // 65 seconds
            await Promise.resolve();
        });

        expect(fetch).toHaveBeenCalledTimes(1);
        const fetchArgs = vi.mocked(fetch).mock.calls[0];
        expect(fetchArgs[0]).toBe("/api/activity/log");

        // We can parse the fetch body
        const reqOpts = fetchArgs[1];
        const bodyObj = JSON.parse(reqOpts?.body as string);

        expect(bodyObj.duration_seconds).toBe(60);
        expect(bodyObj.content_id).toBe("test-content-id");
    });

    it("flushes a short session on unmount", () => {
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

        expect(fetch).toHaveBeenCalledTimes(1);
        const fetchArgs = vi.mocked(fetch).mock.calls[0];
        expect(fetchArgs[0]).toBe("/api/activity/log");

        const reqOpts = fetchArgs[1];
        const bodyObj = JSON.parse(reqOpts?.body as string);

        expect(bodyObj.duration_seconds).toBe(30);
        expect(bodyObj.content_id).toBe("test-content-id");
        expect(typeof bodyObj.visitor_id).toBe("string");
    });

    it("flushes a short session on pagehide", () => {
        Object.defineProperty(document, "visibilityState", {
            configurable: true,
            get: () => "visible",
        });

        renderHook(() => useReadingTimer("test-content-id"));

        act(() => {
            vi.advanceTimersByTime(30 * 1000);
            window.dispatchEvent(new Event("pagehide"));
        });

        expect(fetch).toHaveBeenCalledTimes(1);
        const fetchArgs = vi.mocked(fetch).mock.calls[0];
        const reqOpts = fetchArgs[1];
        const bodyObj = JSON.parse(reqOpts?.body as string);

        expect(bodyObj.duration_seconds).toBe(30);
        expect(bodyObj.content_id).toBe("test-content-id");
    });

    it("does not double-send when pagehide is followed by unmount", () => {
        Object.defineProperty(document, "visibilityState", {
            configurable: true,
            get: () => "visible",
        });

        const deferred = Promise.resolve(new Response(null, { status: 200 }));
        global.fetch = vi.fn(() => deferred);

        const { unmount } = renderHook(() => useReadingTimer("test-content-id"));

        act(() => {
            vi.advanceTimersByTime(30 * 1000);
            window.dispatchEvent(new Event("pagehide"));
            unmount();
        });

        expect(fetch).toHaveBeenCalledTimes(1);
    });
});
