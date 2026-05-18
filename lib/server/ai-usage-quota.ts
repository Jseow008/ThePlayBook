type SupabaseLike = {
    from: (table: string) => any;
};

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

    const parsed = Number.parseInt(value, 10);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

export function getAiUsageQuotaLimits(): AiUsageQuotaLimits {
    return {
        day: parsePositiveInteger(process.env.AI_DAILY_MESSAGE_LIMIT, DEFAULT_AI_USAGE_QUOTA_LIMITS.day),
        week: parsePositiveInteger(process.env.AI_WEEKLY_MESSAGE_LIMIT, DEFAULT_AI_USAGE_QUOTA_LIMITS.week),
        month: parsePositiveInteger(process.env.AI_MONTHLY_MESSAGE_LIMIT, DEFAULT_AI_USAGE_QUOTA_LIMITS.month),
    };
}

function startOfUtcDay(now: Date): Date {
    return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

function startOfUtcWeek(now: Date): Date {
    const dayStart = startOfUtcDay(now);
    const utcDay = dayStart.getUTCDay();
    const daysSinceMonday = (utcDay + 6) % 7;
    dayStart.setUTCDate(dayStart.getUTCDate() - daysSinceMonday);
    return dayStart;
}

function startOfUtcMonth(now: Date): Date {
    return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
}

function addUtcDays(date: Date, days: number): Date {
    const next = new Date(date);
    next.setUTCDate(next.getUTCDate() + days);
    return next;
}

function addUtcMonths(date: Date, months: number): Date {
    const next = new Date(date);
    next.setUTCMonth(next.getUTCMonth() + months);
    return next;
}

function getWindowBoundaries(now: Date): Record<QuotaWindow, { start: Date; resetAt: Date }> {
    const dayStart = startOfUtcDay(now);
    const weekStart = startOfUtcWeek(now);
    const monthStart = startOfUtcMonth(now);

    return {
        day: { start: dayStart, resetAt: addUtcDays(dayStart, 1) },
        week: { start: weekStart, resetAt: addUtcDays(weekStart, 7) },
        month: { start: monthStart, resetAt: addUtcMonths(monthStart, 1) },
    };
}

async function countUsageSince(
    supabase: SupabaseLike,
    userId: string,
    since: Date
): Promise<number> {
    const { count, error } = await supabase
        .from("ai_message_usage")
        .select("id", { count: "exact", head: true })
        .eq("user_id", userId)
        .gte("created_at", since.toISOString());

    if (error) {
        throw error;
    }

    return count ?? 0;
}

export async function checkAiUsageQuota(
    supabase: SupabaseLike,
    userId: string,
    now: Date = new Date()
): Promise<AiUsageQuotaResult> {
    const limits = getAiUsageQuotaLimits();
    const boundaries = getWindowBoundaries(now);
    const windows: QuotaWindow[] = ["day", "week", "month"];
    const states: QuotaWindowState[] = [];

    for (const window of windows) {
        const used = await countUsageSince(supabase, userId, boundaries[window].start);
        const limit = limits[window];

        states.push({
            window,
            limit,
            used,
            remaining: Math.max(0, limit - used),
            resetAt: boundaries[window].resetAt,
        });
    }

    const blocked = states.find((state) => state.used >= state.limit);
    if (!blocked) {
        return { allowed: true, windows: states };
    }

    return {
        allowed: false,
        blockedWindow: blocked.window,
        limit: blocked.limit,
        used: blocked.used,
        retryAfterMs: Math.max(0, blocked.resetAt.getTime() - now.getTime()),
        resetAt: blocked.resetAt,
        windows: states,
    };
}

export async function recordGeneratedAiMessage(
    supabase: SupabaseLike,
    params: { userId: string; feature: AiUsageFeature }
): Promise<void> {
    const { error } = await supabase
        .from("ai_message_usage")
        .insert({
            user_id: params.userId,
            feature: params.feature,
        });

    if (error) {
        throw error;
    }
}

export function getQuotaExceededMessage(result: AiUsageQuotaBlocked): string {
    const label = result.blockedWindow === "day"
        ? "daily"
        : result.blockedWindow === "week"
            ? "weekly"
            : "monthly";

    return `You've reached your ${label} AI message limit of ${result.limit}. Please try again after this limit resets.`;
}
