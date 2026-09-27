import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { admitAiUsage, DEFAULT_AI_USAGE_QUOTA_LIMITS, getAiUsageQuotaLimits, getQuotaExceededMessage } from "../ai-usage-quota";
import { getAdminClient } from "@/lib/supabase/admin";
vi.mock("@/lib/supabase/admin", () => ({ getAdminClient: vi.fn() }));

const states = ["day", "week", "month"].map((window) => ({ window, limit: 20, used: 19, remaining: 1, resetAt: "2026-10-01T00:00:00Z" }));
describe("atomic AI admission", () => {
    const abortSignal = vi.fn();
    const rpc = vi.fn(() => ({ abortSignal }));
    beforeEach(() => {
        vi.clearAllMocks();
        vi.mocked(getAdminClient).mockReturnValue({ rpc } as unknown as ReturnType<typeof getAdminClient>);
        abortSignal.mockResolvedValue({ data: { allowed: true, windows: states }, error: null });
    });
    afterEach(() => vi.unstubAllEnvs());
    it("uses the current defaults and rejects malformed overrides", () => {
        expect(getAiUsageQuotaLimits()).toEqual(DEFAULT_AI_USAGE_QUOTA_LIMITS);
        vi.stubEnv("AI_DAILY_MESSAGE_LIMIT", "3junk");
        vi.stubEnv("AI_WEEKLY_MESSAGE_LIMIT", "9999999999999");
        vi.stubEnv("AI_MONTHLY_MESSAGE_LIMIT", "30");
        expect(getAiUsageQuotaLimits()).toEqual({ day: 20, week: 100, month: 30 });
    });
    it("uses one trusted RPC for the authenticated identity and feature", async () => {
        const result = await admitAiUsage("account-a", "ask-notes", new AbortController().signal);
        expect(result.allowed).toBe(true);
        expect(rpc).toHaveBeenCalledExactlyOnceWith("admit_ai_usage", {
            p_user_id: "account-a", p_feature: "ask-notes", p_day_limit: 20, p_week_limit: 100, p_month_limit: 300,
        });
        expect(result.windows[0].resetAt).toBeInstanceOf(Date);
    });
    it("preserves the database's blocked window and retry delay", async () => {
        abortSignal.mockResolvedValue({ data: { allowed: false, windows: states, blockedWindow: "week", limit: 100, used: 100, retryAfterMs: 1234, resetAt: states[0].resetAt }, error: null });
        const result = await admitAiUsage("account-a", "ask-library", new AbortController().signal);
        expect(result.allowed).toBe(false);
        if (!result.allowed) {
            expect(result.retryAfterMs).toBe(1234);
            expect(getQuotaExceededMessage(result)).toContain("weekly AI message limit of 100");
        }
    });
    it("does not contact the database after cancellation", async () => {
        await expect(admitAiUsage("account-a", "author-chat", AbortSignal.abort())).rejects.toThrow();
        expect(rpc).not.toHaveBeenCalled();
    });
    it("rejects cancellation while the admission is in flight", async () => {
        const controller = new AbortController();
        abortSignal.mockImplementationOnce(async () => {
            controller.abort();
            return { data: { allowed: true, windows: states }, error: null };
        });
        await expect(admitAiUsage("account-a", "author-chat", controller.signal)).rejects.toThrow();
        expect(rpc).toHaveBeenCalledTimes(1);
    });
    it.each([{ data: null, error: { message: "connection lost" } }, { data: { allowed: true }, error: null }])("fails closed without retrying an error or malformed acknowledgement", async (response) => {
        abortSignal.mockResolvedValue(response);
        await expect(admitAiUsage("account-a", "ask-notes", new AbortController().signal)).rejects.toThrow();
        expect(rpc).toHaveBeenCalledTimes(1);
    });
});
