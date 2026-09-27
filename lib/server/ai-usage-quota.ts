import "server-only";

import { z } from "zod";
import { getAdminClient } from "@/lib/supabase/admin";

type QuotaWindow = "day" | "week" | "month";

type AiUsageQuotaLimits = Record<QuotaWindow, number>;

type QuotaWindowState = {
    window: QuotaWindow;
    limit: number;
    used: number;
    remaining: number;
    resetAt: Date;
};

type AiUsageQuotaAllowed = {
    allowed: true;
    windows: QuotaWindowState[];
};

type AiUsageQuotaBlocked = {
    allowed: false;
    blockedWindow: QuotaWindow;
    limit: number;
    used: number;
    retryAfterMs: number;
    resetAt: Date;
    windows: QuotaWindowState[];
};

export type AiUsageQuotaResult = AiUsageQuotaAllowed | AiUsageQuotaBlocked;

export type AiUsageFeature = "ask-library" | "ask-notes" | "author-chat";

export const DEFAULT_AI_USAGE_QUOTA_LIMITS: AiUsageQuotaLimits = {
    day: 20,
    week: 100,
    month: 300,
};

function parsePositiveInteger(value: string | undefined, fallback: number): number {
    if (!value) {
        return fallback;
    }

    const parsed = Number(value);
    return /^\d+$/.test(value) && Number.isSafeInteger(parsed) && parsed > 0 && parsed <= 2_147_483_647 ? parsed : fallback;
}

export function getAiUsageQuotaLimits(): AiUsageQuotaLimits {
    return {
        day: parsePositiveInteger(process.env.AI_DAILY_MESSAGE_LIMIT, DEFAULT_AI_USAGE_QUOTA_LIMITS.day),
        week: parsePositiveInteger(process.env.AI_WEEKLY_MESSAGE_LIMIT, DEFAULT_AI_USAGE_QUOTA_LIMITS.week),
        month: parsePositiveInteger(process.env.AI_MONTHLY_MESSAGE_LIMIT, DEFAULT_AI_USAGE_QUOTA_LIMITS.month),
    };
}

const windowSchema = z.object({
    window: z.enum(["day", "week", "month"]),
    limit: z.number().int().positive(), used: z.number().int().nonnegative(),
    remaining: z.number().int().nonnegative(), resetAt: z.coerce.date(),
});
const admissionSchema = z.discriminatedUnion("allowed", [
    z.object({ allowed: z.literal(true), windows: z.array(windowSchema).length(3) }),
    z.object({ allowed: z.literal(false), windows: z.array(windowSchema).length(3),
        blockedWindow: z.enum(["day", "week", "month"]), limit: z.number().int().positive(),
        used: z.number().int().nonnegative(), retryAfterMs: z.number().int().nonnegative(), resetAt: z.coerce.date() }),
]);

/** Count one dispatch attempt atomically, before the first provider call.
 * Provider failures/cancellation do not refund paid attempts. Never automatically
 * retry an ambiguous RPC result: fail closed without dispatching provider work.
 */
export async function admitAiUsage(
    userId: string, feature: AiUsageFeature, signal: AbortSignal,
): Promise<AiUsageQuotaResult> {
    signal.throwIfAborted();
    const limits = getAiUsageQuotaLimits();
    const { data, error } = await getAdminClient().rpc("admit_ai_usage", {
        p_user_id: userId, p_feature: feature,
        p_day_limit: limits.day, p_week_limit: limits.week, p_month_limit: limits.month,
    }).abortSignal(AbortSignal.any([signal, AbortSignal.timeout(10_000)]));
    if (error) throw new Error("AI admission unavailable", { cause: error });
    signal.throwIfAborted();
    return admissionSchema.parse(data);
}

export function getQuotaExceededMessage(result: AiUsageQuotaBlocked): string {
    const label = result.blockedWindow === "day"
        ? "daily"
        : result.blockedWindow === "week"
            ? "weekly"
            : "monthly";

    return `You've reached your ${label} AI message limit of ${result.limit}. Please try again after this limit resets.`;
}
