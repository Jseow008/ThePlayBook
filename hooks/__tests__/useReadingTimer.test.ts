// @vitest-environment jsdom
import { renderHook, act } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { useReadingTimer } from "../useReadingTimer";

describe("useReadingTimer", () => {
    function getActivityLogFetchCall() {
        const calls = vi.mocked(fetch).mock.calls.filter((call) => call[0] === "/api/activity/log");
        expect(calls).toHaveLength(1);
        return calls[0];
    }

    beforeEach(() => {
        vi.useFakeTimers();
        window.localStorage.clear();
        global.fetch = vi.fn((input) => {
            if (input === "/api/activity/anonymous-session") {
                return Promise.resolve(new Response(JSON.stringify({
                    visitor_id: "123e4567-e89b-12d3-a456-426614174111",
                    visitor_token: "signed-token",
                    expires_at: Date.now() + 60_000,
                }), {
                    status: 200,
                    headers: { "Content-Type": "application/json" },
                }));
            }

            return Promise.resolve(new Response(null, { status: 200 }));
        });
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

        const fetchArgs = getActivityLogFetchCall();
        expect(fetchArgs[0]).toBe("/api/activity/log");

        // We can parse the fetch body
        const reqOpts = fetchArgs[1];
        const bodyObj = JSON.parse(reqOpts?.body as string);

        expect(bodyObj.duration_seconds).toBe(60);
        expect(bodyObj.content_id).toBe("test-content-id");
        expect(bodyObj.visitor_id).toBe("123e4567-e89b-12d3-a456-426614174111");
        expect(bodyObj.visitor_token).toBe("signed-token");
    });

    it("flushes a short session on unmount", async () => {
        Object.defineProperty(document, "visibilityState", {
            configurable: true,
            get: () => "visible",
        });

        const { unmount } = renderHook(() => useReadingTimer("test-content-id"));

        act(() => {
            vi.advanceTimersByTime(30 * 1000); // 30 seconds
        });

        // unmounting should NOT trigger heartbeat
        await act(async () => {
            unmount();
            await Promise.resolve();
        });

        const fetchArgs = getActivityLogFetchCall();
        expect(fetchArgs[0]).toBe("/api/activity/log");

        const reqOpts = fetchArgs[1];
        const bodyObj = JSON.parse(reqOpts?.body as string);

        expect(bodyObj.duration_seconds).toBe(30);
        expect(bodyObj.content_id).toBe("test-content-id");
        expect(typeof bodyObj.visitor_id).toBe("string");
        expect(bodyObj.visitor_token).toBe("signed-token");
    });

    it("flushes a short session on pagehide", async () => {
        Object.defineProperty(document, "visibilityState", {
            configurable: true,
            get: () => "visible",
        });

        renderHook(() => useReadingTimer("test-content-id"));

        await act(async () => {
            vi.advanceTimersByTime(30 * 1000);
            window.dispatchEvent(new Event("pagehide"));
            await Promise.resolve();
        });

        const fetchArgs = getActivityLogFetchCall();
        const reqOpts = fetchArgs[1];
        const bodyObj = JSON.parse(reqOpts?.body as string);

        expect(bodyObj.duration_seconds).toBe(30);
        expect(bodyObj.content_id).toBe("test-content-id");
    });

    it("does not double-send when pagehide is followed by unmount", async () => {
        Object.defineProperty(document, "visibilityState", {
            configurable: true,
            get: () => "visible",
        });

        const deferred = Promise.resolve(new Response(null, { status: 200 }));
        global.fetch = vi.fn((input) => {
            if (input === "/api/activity/anonymous-session") {
                return Promise.resolve(new Response(JSON.stringify({
                    visitor_id: "123e4567-e89b-12d3-a456-426614174111",
                    visitor_token: "signed-token",
                    expires_at: Date.now() + 60_000,
                }), {
                    status: 200,
                    headers: { "Content-Type": "application/json" },
                }));
            }

            return deferred;
        });

        const { unmount } = renderHook(() => useReadingTimer("test-content-id"));

        await act(async () => {
            vi.advanceTimersByTime(30 * 1000);
            window.dispatchEvent(new Event("pagehide"));
            unmount();
            await Promise.resolve();
        });

        expect(vi.mocked(fetch).mock.calls.filter((call) => call[0] === "/api/activity/log")).toHaveLength(1);
    });
});
