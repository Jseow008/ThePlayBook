import { beforeEach, describe, expect, it, vi } from "vitest";
import { getAdminInsights } from "@/lib/admin/insights";
import { getAdminClient } from "@/lib/supabase/admin";

vi.mock("@/lib/supabase/admin", () => ({
    getAdminClient: vi.fn(),
}));

function createThenableQuery<T extends { data?: unknown; error?: unknown; count?: number | null }>(
    result: T,
    calls: Array<{ method: string; args: unknown[] }>
) {
    const promise = Promise.resolve(result);
    const query = {
        select: (...args: unknown[]) => {
            calls.push({ method: "select", args });
            return query;
        },
        eq: (...args: unknown[]) => {
            calls.push({ method: "eq", args });
            return query;
        },
        gte: (...args: unknown[]) => {
            calls.push({ method: "gte", args });
            return query;
        },
        not: (...args: unknown[]) => {
            calls.push({ method: "not", args });
            return query;
        },
        in: (...args: unknown[]) => {
            calls.push({ method: "in", args });
            return query;
        },
        is: (...args: unknown[]) => {
            calls.push({ method: "is", args });
            return query;
        },
        then: promise.then.bind(promise),
        catch: promise.catch.bind(promise),
        finally: promise.finally.bind(promise),
    };

    return query;
}

describe("getAdminInsights", () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it("excludes internal user IDs from user-linked analytics queries", async () => {
        const queryCalls = new Map<string, Array<{ method: string; args: unknown[] }>>();
        const results: Record<string, { data?: unknown; error?: unknown; count?: number | null }> = {
            profiles: {
                data: [{ id: "internal-user-id", is_internal: true }],
                error: null,
            },
            content_reading_activity: {
                data: [
                    {
                        content_id: "content-1",
                        duration_seconds: 1800,
                        reader_count: 3,
                        activity_date: "2026-03-11",
                    },
                ],
                error: null,
            },
            user_library: {
                data: null,
                count: 4,
                error: null,
            },
            user_highlights: {
                data: null,
                count: 2,
                error: null,
            },
            content_feedback: {
                data: [
                    {
                        content_id: "content-1",
                        is_positive: true,
                        created_at: "2026-03-11T00:00:00.000Z",
                        user_id: "real-user-id",
                    },
                ],
                error: null,
            },
            content_item: {
                data: [
                    {
                        id: "content-1",
                        title: "Alpha",
                        author: "Author A",
                        type: "article",
                        status: "verified",
                        deleted_at: null,
                    },
                ],
                error: null,
            },
        };

        (getAdminClient as unknown as ReturnType<typeof vi.fn>).mockReturnValue({
            from: (table: string) => {
                const calls: Array<{ method: string; args: unknown[] }> = [];
                queryCalls.set(table, calls);
                return createThenableQuery(results[table], calls);
            },
        });

        const insights = await getAdminInsights("7d");

        expect(insights.cards[0].value).toBe("3");
        expect(insights.cards[1].value).toBe("30 min");
        expect(insights.cards[2].value).toBe("4");
        expect(insights.cards[3].value).toBe("2");
        expect(insights.feedbackSummary).toEqual([
            {
                id: "content-1",
                title: "Alpha",
                positiveCount: 1,
                negativeCount: 0,
                totalCount: 1,
            },
        ]);

        expect(queryCalls.get("user_library")).toContainEqual({
            method: "not",
            args: ["user_id", "in", "(\"internal-user-id\")"],
        });
        expect(queryCalls.get("user_highlights")).toContainEqual({
            method: "not",
            args: ["user_id", "in", "(\"internal-user-id\")"],
        });
        expect(queryCalls.get("content_feedback")).toContainEqual({
            method: "not",
            args: ["user_id", "in", "(\"internal-user-id\")"],
        });
    });

    it("skips exclusion filters when there are no internal accounts", async () => {
        const queryCalls = new Map<string, Array<{ method: string; args: unknown[] }>>();
        const results: Record<string, { data?: unknown; error?: unknown; count?: number | null }> = {
            profiles: {
                data: [],
                error: null,
            },
            content_reading_activity: {
                data: [],
                error: null,
            },
            user_library: {
                data: null,
                count: 0,
                error: null,
            },
            user_highlights: {
                data: null,
                count: 0,
                error: null,
            },
            content_feedback: {
                data: [],
                error: null,
            },
            content_item: {
                data: [],
                error: null,
            },
        };

        (getAdminClient as unknown as ReturnType<typeof vi.fn>).mockReturnValue({
            from: (table: string) => {
                const calls: Array<{ method: string; args: unknown[] }> = [];
                queryCalls.set(table, calls);
                return createThenableQuery(results[table], calls);
            },
        });

        const insights = await getAdminInsights("30d");

        expect(insights.cards[0].value).toBe("0");
        expect(insights.feedbackSummary).toEqual([]);
        expect(queryCalls.get("user_library")?.some((call) => call.method === "not")).toBe(false);
        expect(queryCalls.get("user_highlights")?.some((call) => call.method === "not")).toBe(false);
        expect(queryCalls.get("content_feedback")?.some((call) => call.method === "not")).toBe(false);
    });
});
