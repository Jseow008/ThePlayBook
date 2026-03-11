import type { Tables } from "@/types/database";
import { getAdminClient } from "@/lib/supabase/admin";

export type InsightsRange = "7d" | "30d";

type ContentRow = Tables<"content_item">;
type InsightsContentRow = Pick<ContentRow, "id" | "title" | "author" | "type">;
type ProfileRow = Tables<"profiles">;
type ContentReadingActivityRow = Pick<
    Tables<"content_reading_activity">,
    "content_id" | "duration_seconds" | "reader_count" | "activity_date"
>;
type ContentFeedbackRow = Pick<
    Tables<"content_feedback">,
    "content_id" | "is_positive" | "created_at" | "user_id"
>;

export interface InsightsCardData {
    title: string;
    value: string;
    detail: string;
}

export interface RankedContentInsight {
    id: string;
    title: string;
    author: string | null;
    type: ContentRow["type"];
    durationSeconds: number;
    readerCount: number;
}

export interface FeedbackInsight {
    id: string;
    title: string;
    positiveCount: number;
    negativeCount: number;
    totalCount: number;
}

export interface AdminInsightsData {
    range: InsightsRange;
    days: number;
    startDate: string;
    cards: InsightsCardData[];
    topByDuration: RankedContentInsight[];
    topByReaders: RankedContentInsight[];
    feedbackSummary: FeedbackInsight[];
}

interface ContentAggregate {
    durationSeconds: number;
    readerCount: number;
}

function getRangeDays(range: InsightsRange): number {
    return range === "30d" ? 30 : 7;
}

function formatUtcDate(date: Date): string {
    return date.toISOString().split("T")[0];
}

function getUtcDateDaysAgoInclusive(days: number): string {
    const date = new Date();
    date.setUTCHours(0, 0, 0, 0);
    date.setUTCDate(date.getUTCDate() - (days - 1));
    return formatUtcDate(date);
}

function getStartTimestamp(date: string): string {
    return `${date}T00:00:00.000Z`;
}

function formatReadingTime(seconds: number): string {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.round((seconds % 3600) / 60);

    if (hours === 0) return `${minutes} min`;
    if (minutes === 0) return `${hours} hr`;
    return `${hours}h ${minutes}m`;
}

function buildContentMap(items: InsightsContentRow[]) {
    return new Map(items.map((item) => [item.id, item]));
}

function buildNotInFilter(ids: string[]) {
    return `(${ids.map((id) => `"${id}"`).join(",")})`;
}

async function fetchInternalUserIds(): Promise<string[]> {
    const supabase = getAdminClient();
    const { data, error } = await supabase
        .from("profiles")
        .select("id, is_internal")
        .eq("is_internal", true);

    if (error) {
        throw error;
    }

    return ((data ?? []) as Array<Pick<ProfileRow, "id" | "is_internal">>).map((row) => row.id);
}

async function fetchContentItems(contentIds: string[]): Promise<InsightsContentRow[]> {
    if (contentIds.length === 0) return [];

    const supabase = getAdminClient();
    const { data, error } = await supabase
        .from("content_item")
        .select("id, title, author, type, status, deleted_at")
        .in("id", contentIds)
        .eq("status", "verified")
        .is("deleted_at", null);

    if (error) {
        throw error;
    }

    return (data ?? []) as InsightsContentRow[];
}

function aggregateContentActivity(rows: ContentReadingActivityRow[]) {
    const aggregates = new Map<string, ContentAggregate>();

    for (const row of rows) {
        const current = aggregates.get(row.content_id) ?? {
            durationSeconds: 0,
            readerCount: 0,
        };

        current.durationSeconds += row.duration_seconds;
        current.readerCount += row.reader_count;
        aggregates.set(row.content_id, current);
    }

    return aggregates;
}

function buildRankedContent(
    aggregates: Map<string, ContentAggregate>,
    contentMap: Map<string, InsightsContentRow>,
    sortBy: "duration" | "readers"
) {
    const ranked: RankedContentInsight[] = [];

    for (const [contentId, stats] of aggregates) {
        const item = contentMap.get(contentId);
        if (!item) continue;

        ranked.push({
            id: item.id,
            title: item.title,
            author: item.author,
            type: item.type,
            durationSeconds: stats.durationSeconds,
            readerCount: stats.readerCount,
        });
    }

    ranked.sort((a, b) => {
        if (sortBy === "duration") {
            return (
                b.durationSeconds - a.durationSeconds ||
                b.readerCount - a.readerCount ||
                a.title.localeCompare(b.title)
            );
        }

        return (
            b.readerCount - a.readerCount ||
            b.durationSeconds - a.durationSeconds ||
            a.title.localeCompare(b.title)
        );
    });

    return ranked.slice(0, 10);
}

function buildFeedbackSummary(
    rows: ContentFeedbackRow[],
    contentMap: Map<string, InsightsContentRow>
) {
    const summary = new Map<string, FeedbackInsight>();

    for (const row of rows) {
        const item = contentMap.get(row.content_id);
        if (!item) continue;

        const current = summary.get(row.content_id) ?? {
            id: item.id,
            title: item.title,
            positiveCount: 0,
            negativeCount: 0,
            totalCount: 0,
        };

        current.totalCount += 1;
        if (row.is_positive) {
            current.positiveCount += 1;
        } else {
            current.negativeCount += 1;
        }

        summary.set(row.content_id, current);
    }

    return Array.from(summary.values())
        .sort((a, b) => b.totalCount - a.totalCount || a.title.localeCompare(b.title))
        .slice(0, 10);
}

export async function getAdminInsights(range: InsightsRange): Promise<AdminInsightsData> {
    const days = getRangeDays(range);
    const startDate = getUtcDateDaysAgoInclusive(days);
    const startTimestamp = getStartTimestamp(startDate);
    const supabase = getAdminClient();
    const internalUserIds = await fetchInternalUserIds();
    const internalUserFilter = internalUserIds.length > 0 ? buildNotInFilter(internalUserIds) : null;

    let bookmarksQuery = supabase
        .from("user_library")
        .select("content_id", { count: "exact", head: true })
        .eq("is_bookmarked", true);

    let highlightsQuery = supabase
        .from("user_highlights")
        .select("id", { count: "exact", head: true })
        .gte("created_at", startTimestamp);

    let feedbackQuery = supabase
        .from("content_feedback")
        .select("content_id, is_positive, created_at, user_id")
        .gte("created_at", startTimestamp);

    if (internalUserFilter) {
        bookmarksQuery = bookmarksQuery.not("user_id", "in", internalUserFilter);
        highlightsQuery = highlightsQuery.not("user_id", "in", internalUserFilter);
        feedbackQuery = feedbackQuery.not("user_id", "in", internalUserFilter);
    }

    const [
        contentActivityResult,
        bookmarksResult,
        highlightsResult,
        feedbackResult,
    ] = await Promise.all([
        supabase
            .from("content_reading_activity")
            .select("content_id, duration_seconds, reader_count, activity_date")
            .gte("activity_date", startDate),
        bookmarksQuery,
        highlightsQuery,
        feedbackQuery,
    ]);

    if (contentActivityResult.error) throw contentActivityResult.error;
    if (bookmarksResult.error) throw bookmarksResult.error;
    if (highlightsResult.error) throw highlightsResult.error;
    if (feedbackResult.error) throw feedbackResult.error;

    const contentActivityRows = (contentActivityResult.data ?? []) as ContentReadingActivityRow[];
    const feedbackRows = (feedbackResult.data ?? []) as ContentFeedbackRow[];
    const contentIds = Array.from(
        new Set([
            ...contentActivityRows.map((row) => row.content_id),
            ...feedbackRows.map((row) => row.content_id),
        ])
    );
    const contentItems = await fetchContentItems(contentIds);
    const contentMap = buildContentMap(contentItems);
    const aggregates = aggregateContentActivity(contentActivityRows);

    const totalReaders = contentActivityRows.reduce((sum, row) => sum + row.reader_count, 0);
    const totalReadingTimeSeconds = contentActivityRows.reduce(
        (sum, row) => sum + row.duration_seconds,
        0
    );
    const totalBookmarks = bookmarksResult.count ?? 0;
    const totalHighlights = highlightsResult.count ?? 0;

    return {
        range,
        days,
        startDate,
        cards: [
            {
                title: `Readers (${days}d)`,
                value: totalReaders.toLocaleString(),
                detail: "Unique reader-days across all content",
            },
            {
                title: `Reading Time (${days}d)`,
                value: formatReadingTime(totalReadingTimeSeconds),
                detail: `${totalReadingTimeSeconds.toLocaleString()} seconds captured`,
            },
            {
                title: "Bookmarks",
                value: totalBookmarks.toLocaleString(),
                detail: "Current saved items across users",
            },
            {
                title: `Highlights (${days}d)`,
                value: totalHighlights.toLocaleString(),
                detail: "Created within the selected range",
            },
        ],
        topByDuration: buildRankedContent(aggregates, contentMap, "duration"),
        topByReaders: buildRankedContent(aggregates, contentMap, "readers"),
        feedbackSummary: buildFeedbackSummary(feedbackRows, contentMap),
    };
}
