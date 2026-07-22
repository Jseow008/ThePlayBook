import { beforeEach, describe, expect, it, vi } from "vitest";
import {
    subscribeEmailSubscription,
    unsubscribeEmailSubscriptionByToken,
    unsubscribeRequestPublishedNotificationsByToken,
} from "@/lib/server/email-subscription-rpcs";
import { getAdminClient } from "@/lib/supabase/admin";

vi.mock("@/lib/supabase/admin", () => ({
    getAdminClient: vi.fn(),
}));

describe("server-only email subscription RPC wrapper", () => {
    const rpc = vi.fn();

    beforeEach(() => {
        vi.clearAllMocks();
        rpc.mockResolvedValue({ data: null, error: null });
        vi.mocked(getAdminClient).mockReturnValue({ rpc } as never);
    });

    it("calls only the fixed subscription RPC", async () => {
        const args = {
            p_email: "reader@example.com",
            p_source: "landing_final_cta",
            p_page_path: "/",
            p_referrer: null,
            p_user_agent: "vitest",
            p_consent_text: "Synthetic consent",
            p_consent_version: "test-v1",
        };

        await subscribeEmailSubscription(args);

        expect(rpc).toHaveBeenCalledWith("subscribe_email_subscription", args);
    });

    it("calls only the fixed weekly unsubscribe RPC", async () => {
        const args = { p_token: "a".repeat(64) };

        await unsubscribeEmailSubscriptionByToken(args);

        expect(rpc).toHaveBeenCalledWith("unsubscribe_email_subscription_by_token", args);
    });

    it("calls only the fixed request-notification unsubscribe RPC", async () => {
        const args = { p_token: "b".repeat(64) };

        await unsubscribeRequestPublishedNotificationsByToken(args);

        expect(rpc).toHaveBeenCalledWith(
            "unsubscribe_request_published_notifications_by_token",
            args,
        );
    });
});
