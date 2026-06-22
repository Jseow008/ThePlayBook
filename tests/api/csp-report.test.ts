import { POST } from "@/app/api/security/csp-report/route";
import { rateLimit } from "@/lib/server/rate-limit";
import * as Sentry from "@sentry/nextjs";
import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const sentryMocks = vi.hoisted(() => {
    const scope = {
        setLevel: vi.fn(),
        setTag: vi.fn(),
        setContext: vi.fn(),
    };

    return {
        scope,
        captureMessage: vi.fn(),
        withScope: vi.fn((callback: (scope: any) => void) => callback(scope)),
    };
});

vi.mock("@sentry/nextjs", () => ({
    captureMessage: sentryMocks.captureMessage,
    withScope: sentryMocks.withScope,
}));

vi.mock("@/lib/server/rate-limit", async () => {
    const actual = await vi.importActual<typeof import("@/lib/server/rate-limit")>("@/lib/server/rate-limit");

    return {
        ...actual,
        rateLimit: vi.fn(),
    };
});

function createRequest(body: unknown, contentType = "application/csp-report") {
    return new NextRequest("http://localhost/api/security/csp-report", {
        method: "POST",
        headers: { "Content-Type": contentType },
        body: JSON.stringify(body),
    });
}

describe("CSP report endpoint", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        vi.mocked(rateLimit).mockResolvedValue({ success: true });
        vi.spyOn(console, "warn").mockImplementation(() => {});
    });

    it("accepts legacy CSP reports and sends sanitized context to Sentry", async () => {
        const response = await POST(createRequest({
            "csp-report": {
                "document-uri": "https://netflux.example/read/abc?token=secret#section",
                "violated-directive": "script-src 'self'",
                "effective-directive": "script-src",
                "blocked-uri": "https://evil.example/tracker.js?secret=leak",
                "source-file": "https://netflux.example/app/page.js?session=secret",
                "line-number": 12,
                "column-number": 4,
                "status-code": 200,
                disposition: "enforce",
                "original-policy": "default-src 'self'; secret-value",
                "script-sample": "const secret = 'do-not-send';",
            },
        }));

        expect(response.status).toBe(204);
        expect(Sentry.captureMessage).toHaveBeenCalledWith("CSP violation");
        expect(sentryMocks.scope.setTag).toHaveBeenCalledWith("source", "csp");
        expect(sentryMocks.scope.setContext).toHaveBeenCalledWith("csp_report", expect.objectContaining({
            document_uri: "https://netflux.example/read/abc",
            blocked_uri: "https://evil.example",
            source_file: "https://netflux.example/app/page.js",
            violated_directive: "script-src 'self'",
            effective_directive: "script-src",
            line_number: 12,
            column_number: 4,
            status_code: 200,
            disposition: "enforce",
            has_script_sample: true,
        }));

        const context = sentryMocks.scope.setContext.mock.calls[0]?.[1];
        expect(JSON.stringify(context)).not.toContain("secret");
        expect(JSON.stringify(context)).not.toContain("do-not-send");
        expect(JSON.stringify(context)).not.toContain("original-policy");
    });

    it("accepts Reporting API csp-violation batches", async () => {
        const response = await POST(createRequest([
            {
                type: "csp-violation",
                body: {
                    "document-uri": "https://netflux.example/browse?search=private",
                    "effective-directive": "img-src",
                    "blocked-uri": "data",
                },
            },
        ], "application/reports+json"));

        expect(response.status).toBe(204);
        expect(Sentry.captureMessage).toHaveBeenCalledWith("CSP violation");
        expect(sentryMocks.scope.setContext).toHaveBeenCalledWith("csp_report", expect.objectContaining({
            document_uri: "https://netflux.example/browse",
            effective_directive: "img-src",
            blocked_uri: "data",
        }));
    });

    it("rejects malformed reports without capturing to Sentry", async () => {
        const response = await POST(createRequest("not-a-report", "application/json"));

        expect(response.status).toBe(400);
        expect(Sentry.captureMessage).not.toHaveBeenCalled();
    });

    it("rate limits report ingestion", async () => {
        vi.mocked(rateLimit).mockResolvedValueOnce({ success: false, retryAfterMs: 1500 });

        const response = await POST(createRequest({
            "csp-report": {
                "document-uri": "https://netflux.example/",
                "effective-directive": "script-src",
                "blocked-uri": "inline",
            },
        }));

        expect(response.status).toBe(429);
        expect(response.headers.get("Retry-After")).toBe("2");
        expect(Sentry.captureMessage).not.toHaveBeenCalled();
    });
});
