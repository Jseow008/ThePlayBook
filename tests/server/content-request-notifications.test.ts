import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { getAdminClient } from "@/lib/supabase/admin";
import { getContentRequestNotificationBacklogStats, processQueuedContentRequestNotifications } from "@/lib/server/content-request-notifications";

vi.mock("@/lib/supabase/admin", () => ({ getAdminClient: vi.fn() }));
const rpc = vi.fn();
let enabled = true;
const updates: Array<Record<string, unknown>> = [];
const fetchMock = vi.fn();

beforeEach(() => {
    vi.clearAllMocks();
    updates.length = 0;
    enabled = true;
    vi.stubEnv("RESEND_API_KEY", "synthetic-not-a-real-key");
    vi.stubEnv("REQUEST_NOTIFICATION_FROM_EMAIL", "test@example.invalid");
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://example.invalid");
    vi.stubGlobal("fetch", fetchMock);
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ id: "synthetic-message" })));
    rpc.mockImplementation(async (name: string) => name === "count_missing_content_request_notifications"
        ? { data: 2, error: null }
        : { data: [{ id: "synthetic-notification", request_id: "synthetic-request", user_id: "synthetic-account", attempts: 0 }], error: null });
    vi.mocked(getAdminClient).mockReturnValue({ rpc, from: (table: string) => {
        const query = {
            select: () => query,
            eq: () => query,
            lt: () => query,
            gte: () => query,
            update: (value: Record<string, unknown>) => { updates.push(value); return query; },
            in: async () => ({ error: null, data: table === "user_notification_preferences"
                ? [{ user_id: "synthetic-account", request_published_email_enabled: enabled, unsubscribe_token: "synthetic-token" }]
                : [{ id: "synthetic-notification", request_id: "synthetic-request", user_id: "synthetic-account", attempts: 0,
                    request: { id: "synthetic-request", title: "Synthetic request", published_content: { id: "synthetic-content", title: "Synthetic summary" } },
                    profile: { email: "reader@example.invalid" } }] }),
            then: (resolve: (value: unknown) => unknown) => Promise.resolve({ count: 0, error: null }).then(resolve),
        };
        return query;
    } } as unknown as ReturnType<typeof getAdminClient>);
});
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

it("includes the missing-recipient count alongside empty queue counts", async () => {
    expect(await getContentRequestNotificationBacklogStats()).toEqual({ missing: 2, queued: 0, queuedOlderThanOneHour: 0,
        processing: 0, staleProcessing: 0, failed: 0, sentLast24Hours: 0 });
    expect(rpc).toHaveBeenCalledWith("count_missing_content_request_notifications");
});

it("propagates a failed health query instead of silently reporting zero", async () => {
    rpc.mockResolvedValue({ data: null, error: new Error("synthetic database unavailable") });
    await expect(getContentRequestNotificationBacklogStats()).rejects.toThrow("synthetic database unavailable");
});

it("skips opted-out recipients without calling the email provider", async () => {
    enabled = false;
    expect(await processQueuedContentRequestNotifications()).toEqual({ claimed: 1, sent: 0, skipped: 1, failed: 0, retried: 0 });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(updates).toContainEqual(expect.objectContaining({ status: "skipped", last_error: "Recipient disabled request published emails." }));
});

it("retains the existing delivery idempotency key for opted-in recipients", async () => {
    expect(await processQueuedContentRequestNotifications()).toEqual({ claimed: 1, sent: 1, skipped: 0, failed: 0, retried: 0 });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith("https://api.resend.com/emails", expect.objectContaining({
        headers: expect.objectContaining({ "Idempotency-Key": "content-request-published-synthetic-notification" }),
    }));
    expect(updates).toContainEqual(expect.objectContaining({ status: "sent", provider_message_id: "synthetic-message" }));
});
