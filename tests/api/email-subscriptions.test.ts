import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { POST as subscribe } from "@/app/api/email-subscriptions/route";
import {
    GET as unsubscribeGet,
    POST as unsubscribe,
} from "@/app/api/email-subscriptions/unsubscribe/route";
import { GET as unsubscribeRequestPublishedGet } from "@/app/api/notification-preferences/request-published/unsubscribe/route";
import {
    subscribeEmailSubscription,
    unsubscribeEmailSubscriptionByToken,
    unsubscribeRequestPublishedNotificationsByToken,
} from "@/lib/server/email-subscription-rpcs";
import { rateLimit } from "@/lib/server/rate-limit";
import { recordInvalidUnsubscribeToken } from "@/lib/server/security-telemetry";

vi.mock("@/lib/server/email-subscription-rpcs", () => ({
    subscribeEmailSubscription: vi.fn(),
    unsubscribeEmailSubscriptionByToken: vi.fn(),
    unsubscribeRequestPublishedNotificationsByToken: vi.fn(),
}));

vi.mock("@/lib/server/rate-limit", () => ({
    rateLimit: vi.fn(),
    rateLimitFailureResponseWithTelemetry: vi.fn(({ result, message }) =>
        Response.json(
            { error: { code: "RATE_LIMITED", message } },
            {
                status: 429,
                headers: { "Retry-After": String(Math.ceil((result.retryAfterMs ?? 60_000) / 1000)) },
            },
        )
    ),
}));

vi.mock("@/lib/server/security-telemetry", () => ({
    recordInvalidUnsubscribeToken: vi.fn(),
}));

describe("Email subscriptions API", () => {
    beforeEach(() => {
        vi.clearAllMocks();

        (rateLimit as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
            success: true,
            retryAfterMs: 0,
        });

        vi.mocked(subscribeEmailSubscription).mockResolvedValue({ data: null, error: null } as never);
        vi.mocked(unsubscribeEmailSubscriptionByToken).mockResolvedValue({ data: null, error: null } as never);
        vi.mocked(unsubscribeRequestPublishedNotificationsByToken).mockResolvedValue({ data: null, error: null } as never);
    });

    function subscriptionRequest(body: unknown) {
        return new NextRequest("http://localhost/api/email-subscriptions", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "User-Agent": "vitest",
            },
            body: JSON.stringify(body),
        });
    }

    function unsubscribeRequest(body: unknown) {
        return new NextRequest("http://localhost/api/email-subscriptions/unsubscribe", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
        });
    }

    it("creates a subscription with explicit consent metadata", async () => {
        const response = await subscribe(subscriptionRequest({
            email: "Reader@Example.com",
            source: "landing_final_cta",
            page_path: "/",
            referrer: "https://example.com",
        }));

        expect(response.status).toBe(200);
        expect(subscribeEmailSubscription).toHaveBeenCalledWith(expect.objectContaining({
            p_email: "Reader@Example.com",
            p_source: "landing_final_cta",
            p_page_path: "/",
            p_referrer: "https://example.com",
            p_user_agent: "vitest",
            p_consent_version: "weekly-ideas-v1",
            p_consent_text: expect.stringContaining("Subscribe to receive weekly"),
        }));
    });

    it("rejects invalid email payloads", async () => {
        const response = await subscribe(subscriptionRequest({
            email: "not-an-email",
            source: "landing_final_cta",
        }));

        expect(response.status).toBe(400);
        expect(subscribeEmailSubscription).not.toHaveBeenCalled();
    });

    it("rejects unknown subscription sources", async () => {
        const response = await subscribe(subscriptionRequest({
            email: "reader@example.com",
            source: "unknown_surface",
        }));

        expect(response.status).toBe(400);
        expect(subscribeEmailSubscription).not.toHaveBeenCalled();
    });

    it("routes duplicate subscriptions through the idempotent subscription RPC", async () => {
        const response = await subscribe(subscriptionRequest({
            email: "Reader@Example.com",
            source: "landing_final_cta",
        }));

        expect(response.status).toBe(200);
        expect(subscribeEmailSubscription).toHaveBeenCalledWith(expect.objectContaining({
            p_email: "Reader@Example.com",
            p_source: "landing_final_cta",
        }));
    });

    it("returns 429 when subscription requests are rate limited", async () => {
        (rateLimit as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
            success: false,
            retryAfterMs: 1500,
        });

        const response = await subscribe(subscriptionRequest({
            email: "reader@example.com",
            source: "landing_final_cta",
        }));

        expect(response.status).toBe(429);
        expect(response.headers.get("Retry-After")).toBe("2");
        expect(subscribeEmailSubscription).not.toHaveBeenCalled();
    });

    it("returns 500 when subscription persistence fails", async () => {
        vi.mocked(subscribeEmailSubscription).mockResolvedValueOnce({
            data: null,
            error: new Error("database unavailable"),
        } as never);

        const response = await subscribe(subscriptionRequest({
            email: "reader@example.com",
            source: "landing_final_cta",
        }));

        expect(response.status).toBe(500);
    });

    it("marks a subscription as unsubscribed by token", async () => {
        const token = "a".repeat(64);
        const response = await unsubscribe(unsubscribeRequest({ token }));

        expect(response.status).toBe(200);
        expect(unsubscribeEmailSubscriptionByToken).toHaveBeenCalledWith({
            p_token: token,
        });
    });

    it("supports one-click unsubscribe links", async () => {
        const token = "b".repeat(64);
        const response = await unsubscribeGet(
            new NextRequest(`http://localhost/api/email-subscriptions/unsubscribe?token=${token}`)
        );

        expect(response.status).toBe(200);
        expect(response.headers.get("Content-Type")).toContain("text/html");
        expect(unsubscribeEmailSubscriptionByToken).toHaveBeenCalledWith({
            p_token: token,
        });
    });

    it("rejects malformed unsubscribe tokens", async () => {
        const response = await unsubscribe(unsubscribeRequest({ token: "not-hex-".repeat(8) }));

        expect(response.status).toBe(400);
        expect(unsubscribeEmailSubscriptionByToken).not.toHaveBeenCalled();
        expect(recordInvalidUnsubscribeToken).toHaveBeenCalledWith(expect.objectContaining({
            route: "/api/email-subscriptions/unsubscribe",
            channel: "weekly_email",
        }));
        expect(JSON.stringify((recordInvalidUnsubscribeToken as any).mock.calls[0][0])).not.toContain("not-hex");
    });

    it("turns off request-published notifications by token", async () => {
        const token = "c".repeat(64);
        const response = await unsubscribeRequestPublishedGet(
            new NextRequest(`http://localhost/api/notification-preferences/request-published/unsubscribe?token=${token}`)
        );

        expect(response.status).toBe(200);
        expect(response.headers.get("Content-Type")).toContain("text/html");
        expect(unsubscribeRequestPublishedNotificationsByToken).toHaveBeenCalledWith({
            p_token: token,
        });
    });

    it("rejects malformed request-published unsubscribe tokens", async () => {
        const response = await unsubscribeRequestPublishedGet(
            new NextRequest("http://localhost/api/notification-preferences/request-published/unsubscribe?token=short")
        );

        expect(response.status).toBe(400);
        expect(unsubscribeRequestPublishedNotificationsByToken).not.toHaveBeenCalled();
        expect(recordInvalidUnsubscribeToken).toHaveBeenCalledWith(expect.objectContaining({
            route: "/api/notification-preferences/request-published/unsubscribe[GET]",
            channel: "request_published",
        }));
        expect(JSON.stringify((recordInvalidUnsubscribeToken as any).mock.calls[0][0])).not.toContain("short");
    });

    it("returns 500 when request-published unsubscribe persistence fails", async () => {
        vi.mocked(unsubscribeRequestPublishedNotificationsByToken).mockResolvedValueOnce({
            data: null,
            error: new Error("database unavailable"),
        } as never);

        const token = "d".repeat(64);
        const response = await unsubscribeRequestPublishedGet(
            new NextRequest(`http://localhost/api/notification-preferences/request-published/unsubscribe?token=${token}`)
        );

        expect(response.status).toBe(500);
    });

    it("returns 429 when request-published unsubscribe requests are rate limited", async () => {
        (rateLimit as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
            success: false,
            retryAfterMs: 1500,
        });

        const token = "e".repeat(64);
        const response = await unsubscribeRequestPublishedGet(
            new NextRequest(`http://localhost/api/notification-preferences/request-published/unsubscribe?token=${token}`)
        );

        expect(response.status).toBe(429);
        expect(response.headers.get("Retry-After")).toBe("2");
        expect(unsubscribeRequestPublishedNotificationsByToken).not.toHaveBeenCalled();
    });
});
