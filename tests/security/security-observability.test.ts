import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
    __resetSecurityTelemetryForTests,
    recordSecuritySignal,
} from "@/lib/server/security-telemetry";

const sentryMocks = vi.hoisted(() => {
    const scope = {
        setLevel: vi.fn(),
        setTag: vi.fn(),
        setContext: vi.fn(),
        setUser: vi.fn(),
    };

    return {
        scope,
        withScope: vi.fn((callback: (scope: any) => void) => callback(scope)),
        captureMessage: vi.fn(),
    };
});

vi.mock("@sentry/nextjs", () => ({
    withScope: sentryMocks.withScope,
    captureMessage: sentryMocks.captureMessage,
}));

describe("security observability", () => {
    let warnSpy: ReturnType<typeof vi.spyOn>;

    beforeEach(() => {
        vi.clearAllMocks();
        __resetSecurityTelemetryForTests();
        warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    });

    it("emits structured logs and throttled Sentry warning events", () => {
        const request = new NextRequest("http://localhost/api/chat", { method: "POST" });

        recordSecuritySignal({
            signal: "ai_rate_limit_exhausted",
            category: "ai",
            route: "/api/chat",
            request,
            requestId: "request-1",
            userId: "user-123",
            reason: "rate_limit_exhausted",
            retryAfterMs: 20_000,
        });

        recordSecuritySignal({
            signal: "ai_rate_limit_exhausted",
            category: "ai",
            route: "/api/chat",
            request,
            requestId: "request-2",
            userId: "user-123",
            reason: "rate_limit_exhausted",
            retryAfterMs: 20_000,
        });

        expect(warnSpy).toHaveBeenCalledTimes(2);
        expect(sentryMocks.captureMessage).toHaveBeenCalledTimes(1);
        expect(sentryMocks.scope.setLevel).toHaveBeenCalledWith("warning");
        expect(sentryMocks.scope.setTag).toHaveBeenCalledWith("security_signal", "ai_rate_limit_exhausted");
        expect(sentryMocks.scope.setUser).toHaveBeenCalledWith({ id: "user-123" });
    });

    it("does not send unsafe metadata to Sentry context", () => {
        recordSecuritySignal({
            signal: "invalid_unsubscribe_token",
            category: "unsubscribe",
            route: "/api/email-subscriptions/unsubscribe",
            requestId: "request-1",
            reason: "malformed_token",
            metadata: {
                channel: "weekly_email",
                token: "secret-token-value",
                prompt: "private prompt text",
                authorization: "Bearer secret",
                ip: "203.0.113.10",
                total_chars: 120,
            },
        });

        const context = sentryMocks.scope.setContext.mock.calls[0][1];
        const serializedContext = JSON.stringify(context);

        expect(context).toEqual(expect.objectContaining({
            channel: "weekly_email",
            total_chars: 120,
        }));
        expect(serializedContext).not.toContain("secret-token-value");
        expect(serializedContext).not.toContain("private prompt text");
        expect(serializedContext).not.toContain("Bearer secret");
        expect(serializedContext).not.toContain("203.0.113.10");
    });
});
