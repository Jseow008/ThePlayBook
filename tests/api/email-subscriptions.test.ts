import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { POST as subscribe } from "@/app/api/email-subscriptions/route";
import {
    GET as unsubscribeGet,
    POST as unsubscribe,
} from "@/app/api/email-subscriptions/unsubscribe/route";
import { getAdminClient } from "@/lib/supabase/admin";
import { rateLimit } from "@/lib/server/rate-limit";

vi.mock("@/lib/supabase/admin", () => ({
    getAdminClient: vi.fn(),
}));

vi.mock("@/lib/server/rate-limit", () => ({
    rateLimit: vi.fn(),
}));

describe("Email subscriptions API", () => {
    const mockInsert = vi.fn();
    const mockUpdate = vi.fn();
    const mockEq = vi.fn();
    const mockFrom = vi.fn();

    beforeEach(() => {
        vi.clearAllMocks();

        (rateLimit as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
            success: true,
            retryAfterMs: 0,
        });

        mockInsert.mockResolvedValue({ error: null });
        mockEq.mockResolvedValue({ error: null });
        mockUpdate.mockReturnValue({ eq: mockEq });
        mockFrom.mockReturnValue({
            insert: mockInsert,
            update: mockUpdate,
        });

        (getAdminClient as unknown as ReturnType<typeof vi.fn>).mockReturnValue({
            from: mockFrom,
        });
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
        expect(mockFrom).toHaveBeenCalledWith("email_subscription");
        expect(mockInsert).toHaveBeenCalledWith(expect.objectContaining({
            email: "Reader@Example.com",
            source: "landing_final_cta",
            page_path: "/",
            referrer: "https://example.com",
            user_agent: "vitest",
            status: "subscribed",
            unsubscribed_at: null,
            consent_version: "weekly-ideas-v1",
            consent_text: expect.stringContaining("Subscribe to receive weekly"),
        }));
    });

    it("rejects invalid email payloads", async () => {
        const response = await subscribe(subscriptionRequest({
            email: "not-an-email",
            source: "landing_final_cta",
        }));

        expect(response.status).toBe(400);
        expect(mockInsert).not.toHaveBeenCalled();
    });

    it("rejects unknown subscription sources", async () => {
        const response = await subscribe(subscriptionRequest({
            email: "reader@example.com",
            source: "unknown_surface",
        }));

        expect(response.status).toBe(400);
        expect(mockInsert).not.toHaveBeenCalled();
    });

    it("resubscribes existing emails without creating duplicates", async () => {
        mockInsert.mockResolvedValueOnce({
            error: { code: "23505", message: "duplicate key value violates unique constraint" },
        });

        const response = await subscribe(subscriptionRequest({
            email: "Reader@Example.com",
            source: "landing_final_cta",
        }));

        expect(response.status).toBe(200);
        expect(mockUpdate).toHaveBeenCalledWith(expect.objectContaining({
            email: "Reader@Example.com",
            status: "subscribed",
            unsubscribed_at: null,
            subscribed_at: expect.any(String),
        }));
        expect(mockEq).toHaveBeenCalledWith("email_normalized", "reader@example.com");
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
        expect(mockInsert).not.toHaveBeenCalled();
    });

    it("returns 500 when subscription persistence fails", async () => {
        mockInsert.mockResolvedValueOnce({ error: new Error("database unavailable") });

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
        expect(mockFrom).toHaveBeenCalledWith("email_subscription");
        expect(mockUpdate).toHaveBeenCalledWith(expect.objectContaining({
            status: "unsubscribed",
            unsubscribed_at: expect.any(String),
        }));
        expect(mockEq).toHaveBeenCalledWith("unsubscribe_token", token);
    });

    it("supports one-click unsubscribe links", async () => {
        const token = "b".repeat(64);
        const response = await unsubscribeGet(
            new NextRequest(`http://localhost/api/email-subscriptions/unsubscribe?token=${token}`)
        );

        expect(response.status).toBe(200);
        expect(response.headers.get("Content-Type")).toContain("text/html");
        expect(mockUpdate).toHaveBeenCalledWith(expect.objectContaining({
            status: "unsubscribed",
            unsubscribed_at: expect.any(String),
        }));
        expect(mockEq).toHaveBeenCalledWith("unsubscribe_token", token);
    });

    it("rejects malformed unsubscribe tokens", async () => {
        const response = await unsubscribe(unsubscribeRequest({ token: "short" }));

        expect(response.status).toBe(400);
        expect(mockUpdate).not.toHaveBeenCalled();
    });
});
