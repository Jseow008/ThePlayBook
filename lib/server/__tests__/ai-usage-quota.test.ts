import { afterEach, describe, expect, it, vi } from "vitest";
import {
    checkAiUsageQuota,
    DEFAULT_AI_USAGE_QUOTA_LIMITS,
    getAiUsageQuotaLimits,
    getQuotaExceededMessage,
    recordGeneratedAiMessage,
} from "../ai-usage-quota";

function createCountingSupabase(counts: number[]) {
    const gte = vi.fn(async () => ({
        count: counts.shift() ?? 0,
        error: null,
    }));
    const eq = vi.fn(() => ({ gte }));
    const select = vi.fn(() => ({ eq }));
    const from = vi.fn(() => ({ select }));

    return {
        supabase: { from },
        calls: { from, select, eq, gte },
    };
}

describe("AI usage quota", () => {
    afterEach(() => {
        vi.unstubAllEnvs();
        vi.restoreAllMocks();
    });

    it("uses the free-user default limits", () => {
        expect(getAiUsageQuotaLimits()).toEqual(DEFAULT_AI_USAGE_QUOTA_LIMITS);
    });

    it("allows usage below daily, weekly, and monthly limits", async () => {
        const { supabase, calls } = createCountingSupabase([19, 99, 299]);

        const result = await checkAiUsageQuota(
            supabase,
            "user-123",
            new Date("2026-05-18T12:00:00.000Z")
        );

        expect(result.allowed).toBe(true);
        expect(calls.from).toHaveBeenCalledTimes(3);
        expect(calls.gte).toHaveBeenNthCalledWith(1, "created_at", "2026-05-18T00:00:00.000Z");
        expect(calls.gte).toHaveBeenNthCalledWith(2, "created_at", "2026-05-18T00:00:00.000Z");
        expect(calls.gte).toHaveBeenNthCalledWith(3, "created_at", "2026-05-01T00:00:00.000Z");
    });

    it("blocks when any quota window is exhausted", async () => {
        const { supabase } = createCountingSupabase([5, 100, 120]);

        const result = await checkAiUsageQuota(
            supabase,
            "user-123",
            new Date("2026-05-20T12:00:00.000Z")
        );

        expect(result.allowed).toBe(false);
        if (!result.allowed) {
            expect(result.blockedWindow).toBe("week");
            expect(result.limit).toBe(100);
            expect(result.used).toBe(100);
            expect(result.resetAt.toISOString()).toBe("2026-05-25T00:00:00.000Z");
            expect(getQuotaExceededMessage(result)).toContain("weekly AI message limit of 100");
        }
    });

    it("allows env overrides for quota limits", () => {
        vi.stubEnv("AI_DAILY_MESSAGE_LIMIT", "3");
        vi.stubEnv("AI_WEEKLY_MESSAGE_LIMIT", "9");
        vi.stubEnv("AI_MONTHLY_MESSAGE_LIMIT", "30");

        expect(getAiUsageQuotaLimits()).toEqual({
            day: 3,
            week: 9,
            month: 30,
        });
    });

    it("records generated AI messages with feature metadata", async () => {
        const insert = vi.fn(async () => ({ error: null }));
        const from = vi.fn(() => ({ insert }));

        await recordGeneratedAiMessage({ from }, {
            userId: "user-123",
            feature: "ask-library",
        });

        expect(from).toHaveBeenCalledWith("ai_message_usage");
        expect(insert).toHaveBeenCalledWith({
            user_id: "user-123",
            feature: "ask-library",
        });
    });
});
