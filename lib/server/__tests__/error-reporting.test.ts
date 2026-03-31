import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
    buildErrorReportPayload,
    isErrorReportingConfigured,
    reportException,
} from "@/lib/server/error-reporting";

describe("error reporting", () => {
    const originalEnv = { ...process.env };

    beforeEach(() => {
        vi.clearAllMocks();
        process.env = {
            ...originalEnv,
            NODE_ENV: "test",
        };
    });

    afterEach(() => {
        process.env = { ...originalEnv };
        vi.restoreAllMocks();
    });

    it("builds a structured payload from Error instances", () => {
        const payload = buildErrorReportPayload({
            source: "api",
            message: "Admin upload failed",
            requestId: "req-123",
            route: "/api/admin/upload",
            userId: "user-123",
            digest: "digest-123",
            pathname: "/admin",
            url: "https://flux.example/admin",
            context: {
                feature: "uploads",
            },
            error: new Error("boom"),
        });

        expect(payload).toMatchObject({
            app: "flux",
            source: "api",
            message: "Admin upload failed",
            request_id: "req-123",
            route: "/api/admin/upload",
            user_id: "user-123",
            digest: "digest-123",
            pathname: "/admin",
            url: "https://flux.example/admin",
            context: {
                feature: "uploads",
            },
            error: {
                name: "Error",
                message: "boom",
            },
        });
        expect(payload.timestamp).toEqual(expect.any(String));
    });

    it("reports delivery readiness from env wiring", () => {
        expect(isErrorReportingConfigured()).toBe(false);

        process.env.ERROR_REPORTING_WEBHOOK_URL = "https://monitoring.example/ingest";

        expect(isErrorReportingConfigured()).toBe(true);
    });

    it("posts exceptions to the configured webhook", async () => {
        process.env.ERROR_REPORTING_WEBHOOK_URL = "https://monitoring.example/ingest";
        process.env.ERROR_REPORTING_BEARER_TOKEN = "secret-token";

        const fetchMock = vi.fn().mockResolvedValue({
            ok: true,
            status: 202,
        });
        const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
        vi.stubGlobal("fetch", fetchMock);

        const result = await reportException({
            source: "api",
            message: "Failed to update content",
            requestId: "req-456",
            route: "/api/admin/content",
            error: new Error("db down"),
        });

        expect(result).toEqual({ configured: true, delivered: true });
        expect(fetchMock).toHaveBeenCalledWith(
            "https://monitoring.example/ingest",
            expect.objectContaining({
                method: "POST",
                headers: expect.objectContaining({
                    Authorization: "Bearer secret-token",
                    "Content-Type": "application/json",
                }),
            })
        );
        expect(consoleErrorSpy).toHaveBeenCalled();
    });

    it("falls back cleanly when no webhook is configured", async () => {
        const fetchMock = vi.fn();
        const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
        vi.stubGlobal("fetch", fetchMock);

        const result = await reportException({
            source: "api",
            message: "Missing sink",
            requestId: "req-789",
            route: "/api/test",
            error: "bad payload",
        });

        expect(result).toEqual({ configured: false, delivered: false });
        expect(fetchMock).not.toHaveBeenCalled();
        expect(consoleErrorSpy).toHaveBeenCalled();
    });
});
