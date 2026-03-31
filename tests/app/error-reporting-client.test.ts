import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { reportClientException } from "@/app/error-reporting-client";

describe("client error reporting", () => {
    const originalLocation = window.location;

    beforeEach(() => {
        vi.clearAllMocks();
        Object.defineProperty(window, "location", {
            configurable: true,
            value: {
                href: "http://localhost/browse",
                pathname: "/browse",
            },
        });
    });

    afterEach(() => {
        Object.defineProperty(window, "location", {
            configurable: true,
            value: originalLocation,
        });
        vi.restoreAllMocks();
    });

    it("uses sendBeacon when available", async () => {
        const sendBeaconSpy = vi.spyOn(window.navigator, "sendBeacon").mockReturnValue(true);
        const fetchMock = vi.fn();
        vi.stubGlobal("fetch", fetchMock);

        await reportClientException({
            boundary: "app-error-boundary",
            error: Object.assign(new Error("render failed"), { digest: "digest-1" }),
        });

        expect(sendBeaconSpy).toHaveBeenCalledWith(
            "/api/monitor/exceptions",
            expect.stringContaining("\"boundary\":\"app-error-boundary\"")
        );
        expect(fetchMock).not.toHaveBeenCalled();
    });

    it("falls back to fetch when sendBeacon cannot queue the event", async () => {
        vi.spyOn(window.navigator, "sendBeacon").mockReturnValue(false);
        const fetchMock = vi.fn().mockResolvedValue({ ok: true });
        vi.stubGlobal("fetch", fetchMock);

        await reportClientException({
            boundary: "global-error-boundary",
            error: Object.assign(new Error("critical render failed"), { digest: "digest-2" }),
        });

        expect(fetchMock).toHaveBeenCalledWith(
            "/api/monitor/exceptions",
            expect.objectContaining({
                method: "POST",
                keepalive: true,
                headers: {
                    "Content-Type": "application/json",
                },
            })
        );
    });
});
