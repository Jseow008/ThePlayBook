import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
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
        lt: (...args: unknown[]) => {
            calls.push({ method: "lt", args });
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

type QueryResult = { data?: unknown; error?: unknown; count?: number | null };
type QueryCalls = Map<string, Array<Array<{ method: string; args: unknown[] }>>>;

function createMockAdminClient(results: Record<string, QueryResult | QueryResult[]>) {
    const queryCalls: QueryCalls = new Map();
    const tableCallCount = new Map<string, number>();

    const client = {
        from: (table: string) => {
            const calls: Array<{ method: string; args: unknown[] }> = [];
            const tableCalls = queryCalls.get(table) ?? [];
            tableCalls.push(calls);
            queryCalls.set(table, tableCalls);

            const tableResults = Array.isArray(results[table])
                ? results[table] as QueryResult[]
                : [results[table] as QueryResult];
            const callIndex = tableCallCount.get(table) ?? 0;
            tableCallCount.set(table, callIndex + 1);

            return createThenableQuery(tableResults[callIndex] ?? tableResults.at(-1) ?? { data: [], error: null }, calls);
        },
    };

    return { client, queryCalls };
}

function flattenCalls(queryCalls: QueryCalls, table: string) {
    return (queryCalls.get(table) ?? []).flat();
}

describe("getAdminInsights", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        vi.useFakeTimers();
        vi.setSystemTime(new Date("2026-03-12T12:00:00.000Z"));
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    it("excludes internal user IDs from user-linked analytics queries", async () => {
        const { client, queryCalls } = createMockAdminClient({
            profiles: {
                data: [{ id: "internal-user-id", is_internal: true }],
                error: null,
            },
            content_reading_activity: [
                {
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
                {
                    data: [
                        {
                            content_id: "content-1",
                            duration_seconds: 900,
                            reader_count: 1,
                            activity_date: "2026-03-04",
                        },
                    ],
                    error: null,
                },
            ],
            user_library: [
                {
                    data: null,
                    count: 4,
                    error: null,
                },
                {
                    data: [
                        {
                            content_id: "content-1",
                            is_bookmarked: true,
                            last_interacted_at: "2026-03-11T00:00:00.000Z",
                            progress: {
                                completed: ["segment-1"],
                                isCompleted: true,
                                lastReadAt: "2026-03-11T00:00:00.000Z",
                            },
                            user_id: "real-user-id",
                        },
                        {
                            content_id: "content-1",
                            is_bookmarked: false,
                            last_interacted_at: "2026-03-11T00:00:00.000Z",
                            progress: {
                                completed: ["segment-1"],
                                isCompleted: false,
                                lastReadAt: "2026-03-11T00:00:00.000Z",
                            },
                            user_id: "real-user-id",
                        },
                    ],
                    error: null,
                },
                {
                    data: [
                        {
                            content_id: "content-1",
                            is_bookmarked: true,
                            last_interacted_at: "2026-03-04T00:00:00.000Z",
                            progress: {
                                completed: ["segment-1"],
                                isCompleted: false,
                                lastReadAt: "2026-03-04T00:00:00.000Z",
                            },
                            user_id: "real-user-id",
                        },
                    ],
                    error: null,
                },
            ],
            user_highlights: [
                {
                    data: [
                        {
                            id: "highlight-1",
                            content_item_id: "content-1",
                            created_at: "2026-03-11T00:00:00.000Z",
                            user_id: "real-user-id",
                        },
                        {
                            id: "highlight-2",
                            content_item_id: "content-1",
                            created_at: "2026-03-11T00:00:00.000Z",
                            user_id: "real-user-id",
                        },
                    ],
                    error: null,
                },
                {
                    data: null,
                    count: 1,
                    error: null,
                },
            ],
            content_feedback: [
                {
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
                {
                    data: [],
                    error: null,
                },
            ],
            content_item: [
                {
                    data: [
                        {
                            id: "content-1",
                            title: "Alpha",
                            author: "Author A",
                            type: "article",
                            created_at: "2026-03-10T00:00:00.000Z",
                            status: "verified",
                            deleted_at: null,
                        },
                    ],
                    error: null,
                },
                {
                    data: [
                        {
                            id: "content-1",
                            title: "Alpha",
                            author: "Author A",
                            type: "article",
                            created_at: "2026-03-10T00:00:00.000Z",
                            status: "verified",
                            deleted_at: null,
                        },
                    ],
                    error: null,
                },
            ],
        });

        (getAdminClient as unknown as ReturnType<typeof vi.fn>).mockReturnValue(client);

        const insights = await getAdminInsights("7d");

        expect(insights.cards[0].value).toBe("3");
        expect(insights.cards[0].detail).toContain("guest visitors");
        expect(insights.cards[1].value).toBe("30 min");
        expect(insights.cards[1].detail).toContain("signed-in and guest readers");
        expect(insights.cards[2].value).toBe("4");
        expect(insights.cards[2].detail).toContain("signed-in users");
        expect(insights.cards[3].value).toBe("2");
        expect(insights.cards[3].detail).toContain("signed-in users");
        expect(insights.cards[0].trend).toMatchObject({
            currentValue: 3,
            previousValue: 1,
            absoluteChange: 2,
            changeRatio: 2,
            direction: "up",
        });
        expect(insights.cards[1].trend).toMatchObject({
            currentValue: 1800,
            previousValue: 900,
            absoluteChange: 900,
            changeRatio: 1,
            direction: "up",
        });
        expect(insights.cards[2].trend).toMatchObject({
            currentValue: 1,
            previousValue: 1,
            absoluteChange: 0,
            changeRatio: 0,
            direction: "flat",
        });
        expect(insights.cards[3].trend).toMatchObject({
            currentValue: 2,
            previousValue: 1,
            absoluteChange: 1,
            changeRatio: 1,
            direction: "up",
        });
        expect(insights.contentMetrics.completionRate).toMatchObject({
            value: 0.5,
            numerator: 1,
            denominator: 2,
        });
        expect(insights.contentMetrics.savesPerReader).toMatchObject({
            value: 1 / 3,
            numerator: 1,
            denominator: 3,
        });
        expect(insights.contentMetrics.highlightsPerReader).toMatchObject({
            value: 2 / 3,
            numerator: 2,
            denominator: 3,
        });
        expect(insights.contentMetrics.feedbackRate).toMatchObject({
            value: 1 / 3,
            numerator: 1,
            denominator: 3,
        });
        expect(insights.contentMetrics.averageReadingTimePerReader).toMatchObject({
            value: 600,
            numerator: 1800,
            denominator: 3,
        });
        expect(insights.feedbackSummary).toEqual([
            {
                id: "content-1",
                title: "Alpha",
                positiveCount: 1,
                negativeCount: 0,
                totalCount: 1,
            },
        ]);
        expect(insights.decisionTables.mostEngagingContent[0]).toMatchObject({
            id: "content-1",
            title: "Alpha",
            readerCount: 3,
            saveCount: 1,
            highlightCount: 2,
            positiveFeedbackCount: 1,
            negativeFeedbackCount: 0,
            progressCount: 2,
            completedCount: 1,
            completionRate: 0.5,
        });
        expect(insights.decisionTables.highSaves[0]).toMatchObject({
            id: "content-1",
            saveCount: 1,
            savesPerReader: 1 / 3,
        });
        expect(insights.decisionTables.highTrafficLowCompletion[0]).toMatchObject({
            id: "content-1",
            completionRate: 0.5,
        });
        expect(insights.decisionTables.recentlyPublishedPerformance[0]).toMatchObject({
            id: "content-1",
            title: "Alpha",
        });

        expect(flattenCalls(queryCalls, "user_library")).toContainEqual({
            method: "not",
            args: ["user_id", "in", "(\"internal-user-id\")"],
        });
        expect(flattenCalls(queryCalls, "user_highlights")).toContainEqual({
            method: "not",
            args: ["user_id", "in", "(\"internal-user-id\")"],
        });
        expect(flattenCalls(queryCalls, "content_feedback")).toContainEqual({
            method: "not",
            args: ["user_id", "in", "(\"internal-user-id\")"],
        });
    });

    it("skips exclusion filters when there are no internal accounts", async () => {
        const { client, queryCalls } = createMockAdminClient({
            profiles: {
                data: [],
                error: null,
            },
            content_reading_activity: [
                {
                    data: [],
                    error: null,
                },
                {
                    data: [],
                    error: null,
                },
            ],
            user_library: [
                {
                    data: null,
                    count: 0,
                    error: null,
                },
                {
                    data: [],
                    error: null,
                },
                {
                    data: [],
                    error: null,
                },
            ],
            user_highlights: [
                {
                    data: [],
                    error: null,
                },
                {
                    data: null,
                    count: 0,
                    error: null,
                },
            ],
            content_feedback: [
                {
                    data: [],
                    error: null,
                },
                {
                    data: [],
                    error: null,
                },
            ],
            content_item: [
                {
                    data: [],
                    error: null,
                },
                {
                    data: [],
                    error: null,
                },
            ],
        });

        (getAdminClient as unknown as ReturnType<typeof vi.fn>).mockReturnValue(client);

        const insights = await getAdminInsights("30d");

        expect(insights.cards[0].value).toBe("0");
        expect(insights.contentMetrics.completionRate.value).toBe(0);
        expect(insights.feedbackSummary).toEqual([]);
        expect(flattenCalls(queryCalls, "user_library").some((call) => call.method === "not")).toBe(false);
        expect(flattenCalls(queryCalls, "user_highlights").some((call) => call.method === "not")).toBe(false);
        expect(flattenCalls(queryCalls, "content_feedback").some((call) => call.method === "not")).toBe(false);
    });

    it("reports a null trend change ratio when previous period value is zero", async () => {
        const { client } = createMockAdminClient({
            profiles: {
                data: [],
                error: null,
            },
            content_reading_activity: [
                {
                    data: [
                        {
                            content_id: "content-1",
                            duration_seconds: 600,
                            reader_count: 5,
                            activity_date: "2026-03-11",
                        },
                    ],
                    error: null,
                },
                {
                    data: [],
                    error: null,
                },
            ],
            user_library: [
                {
                    data: null,
                    count: 0,
                    error: null,
                },
                {
                    data: [],
                    error: null,
                },
                {
                    data: [],
                    error: null,
                },
            ],
            user_highlights: [
                {
                    data: [],
                    error: null,
                },
                {
                    data: null,
                    count: 0,
                    error: null,
                },
            ],
            content_feedback: [
                {
                    data: [],
                    error: null,
                },
                {
                    data: [],
                    error: null,
                },
            ],
            content_item: [
                {
                    data: [
                        {
                            id: "content-1",
                            title: "Alpha",
                            author: "Author A",
                            type: "article",
                            created_at: "2026-03-10T00:00:00.000Z",
                            status: "verified",
                            deleted_at: null,
                        },
                    ],
                    error: null,
                },
                {
                    data: [
                        {
                            id: "content-1",
                            title: "Alpha",
                            author: "Author A",
                            type: "article",
                            created_at: "2026-03-10T00:00:00.000Z",
                            status: "verified",
                            deleted_at: null,
                        },
                    ],
                    error: null,
                },
            ],
        });

        (getAdminClient as unknown as ReturnType<typeof vi.fn>).mockReturnValue(client);

        const insights = await getAdminInsights("7d");

        expect(insights.cards[0].trend).toMatchObject({
            currentValue: 5,
            previousValue: 0,
            absoluteChange: 5,
            changeRatio: null,
            direction: "up",
        });
    });

    it("sorts decision tables by their editorial signals", async () => {
        const contentItems = [
            {
                id: "content-alpha",
                title: "Alpha",
                author: "Author A",
                type: "article",
                created_at: "2026-03-09T00:00:00.000Z",
                status: "verified",
                deleted_at: null,
            },
            {
                id: "content-beta",
                title: "Beta",
                author: "Author B",
                type: "book",
                created_at: "2026-03-08T00:00:00.000Z",
                status: "verified",
                deleted_at: null,
            },
            {
                id: "content-gamma",
                title: "Gamma",
                author: "Author C",
                type: "podcast",
                created_at: "2026-03-07T00:00:00.000Z",
                status: "verified",
                deleted_at: null,
            },
            {
                id: "content-delta",
                title: "Delta",
                author: "Author D",
                type: "article",
                created_at: "2026-03-12T00:00:00.000Z",
                status: "verified",
                deleted_at: null,
            },
        ];
        const { client } = createMockAdminClient({
            profiles: {
                data: [],
                error: null,
            },
            content_reading_activity: [
                {
                    data: [
                        {
                            content_id: "content-alpha",
                            duration_seconds: 3000,
                            reader_count: 5,
                            activity_date: "2026-03-11",
                        },
                        {
                            content_id: "content-beta",
                            duration_seconds: 600,
                            reader_count: 8,
                            activity_date: "2026-03-11",
                        },
                        {
                            content_id: "content-gamma",
                            duration_seconds: 300,
                            reader_count: 10,
                            activity_date: "2026-03-11",
                        },
                        {
                            content_id: "content-delta",
                            duration_seconds: 60,
                            reader_count: 1,
                            activity_date: "2026-03-11",
                        },
                    ],
                    error: null,
                },
                {
                    data: [],
                    error: null,
                },
            ],
            user_library: [
                {
                    data: null,
                    count: 0,
                    error: null,
                },
                {
                    data: [
                        {
                            content_id: "content-alpha",
                            is_bookmarked: true,
                            last_interacted_at: "2026-03-11T00:00:00.000Z",
                            progress: { isCompleted: true, lastReadAt: "2026-03-11T00:00:00.000Z" },
                            user_id: "user-1",
                        },
                        {
                            content_id: "content-beta",
                            is_bookmarked: true,
                            last_interacted_at: "2026-03-11T00:00:00.000Z",
                            progress: { isCompleted: true, lastReadAt: "2026-03-11T00:00:00.000Z" },
                            user_id: "user-2",
                        },
                        {
                            content_id: "content-beta",
                            is_bookmarked: true,
                            last_interacted_at: "2026-03-11T00:00:00.000Z",
                            progress: { isCompleted: false, lastReadAt: "2026-03-11T00:00:00.000Z" },
                            user_id: "user-3",
                        },
                        {
                            content_id: "content-beta",
                            is_bookmarked: true,
                            last_interacted_at: "2026-03-11T00:00:00.000Z",
                            progress: { isCompleted: false, lastReadAt: "2026-03-11T00:00:00.000Z" },
                            user_id: "user-4",
                        },
                        {
                            content_id: "content-gamma",
                            is_bookmarked: false,
                            last_interacted_at: "2026-03-11T00:00:00.000Z",
                            progress: { isCompleted: true, lastReadAt: "2026-03-11T00:00:00.000Z" },
                            user_id: "user-5",
                        },
                        {
                            content_id: "content-gamma",
                            is_bookmarked: false,
                            last_interacted_at: "2026-03-11T00:00:00.000Z",
                            progress: { isCompleted: false, lastReadAt: "2026-03-11T00:00:00.000Z" },
                            user_id: "user-6",
                        },
                        {
                            content_id: "content-gamma",
                            is_bookmarked: false,
                            last_interacted_at: "2026-03-11T00:00:00.000Z",
                            progress: { isCompleted: false, lastReadAt: "2026-03-11T00:00:00.000Z" },
                            user_id: "user-7",
                        },
                    ],
                    error: null,
                },
                {
                    data: [],
                    error: null,
                },
            ],
            user_highlights: [
                {
                    data: [
                        {
                            id: "highlight-alpha-1",
                            content_item_id: "content-alpha",
                            created_at: "2026-03-11T00:00:00.000Z",
                            user_id: "user-1",
                        },
                        {
                            id: "highlight-alpha-2",
                            content_item_id: "content-alpha",
                            created_at: "2026-03-11T00:00:00.000Z",
                            user_id: "user-2",
                        },
                        {
                            id: "highlight-beta-1",
                            content_item_id: "content-beta",
                            created_at: "2026-03-11T00:00:00.000Z",
                            user_id: "user-3",
                        },
                    ],
                    error: null,
                },
                {
                    data: null,
                    count: 0,
                    error: null,
                },
            ],
            content_feedback: [
                {
                    data: [
                        {
                            content_id: "content-alpha",
                            is_positive: true,
                            created_at: "2026-03-11T00:00:00.000Z",
                            user_id: "user-1",
                        },
                        {
                            content_id: "content-gamma",
                            is_positive: false,
                            created_at: "2026-03-11T00:00:00.000Z",
                            user_id: "user-5",
                        },
                    ],
                    error: null,
                },
                {
                    data: [],
                    error: null,
                },
            ],
            content_item: [
                {
                    data: contentItems,
                    error: null,
                },
                {
                    data: contentItems,
                    error: null,
                },
            ],
        });

        (getAdminClient as unknown as ReturnType<typeof vi.fn>).mockReturnValue(client);

        const insights = await getAdminInsights("7d");

        expect(insights.decisionTables.mostEngagingContent.map((row) => row.id)).toEqual([
            "content-alpha",
            "content-beta",
            "content-gamma",
            "content-delta",
        ]);
        expect(insights.decisionTables.highSaves.map((row) => row.id)).toEqual([
            "content-beta",
            "content-alpha",
        ]);
        expect(insights.decisionTables.highTrafficLowCompletion.map((row) => row.id)).toEqual([
            "content-gamma",
            "content-beta",
        ]);
        expect(insights.decisionTables.needsAttention.map((row) => row.id)).toEqual([
            "content-gamma",
            "content-beta",
            "content-delta",
        ]);
        expect(insights.decisionTables.recentlyPublishedPerformance.map((row) => row.id)).toEqual([
            "content-delta",
            "content-alpha",
            "content-beta",
            "content-gamma",
        ]);
    });
});
