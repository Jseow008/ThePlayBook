import type { Tables } from "@/types/database";
import { getAdminClient } from "@/lib/supabase/admin";

export type InsightsRange = "7d" | "30d";

type ContentRow = Tables<"content_item">;
type InsightsContentRow = Pick<ContentRow, "id" | "title" | "author" | "type" | "created_at">;
type ProfileRow = Tables<"profiles">;
type UserLibraryRow = Pick<
    Tables<"user_library">,
    "content_id" | "is_bookmarked" | "last_interacted_at" | "progress" | "user_id"
>;
type UserHighlightRow = Pick<
    Tables<"user_highlights">,
    "id" | "content_item_id" | "created_at" | "user_id"
>;
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
    trend?: InsightsTrendData;
}

export interface InsightsTrendData {
    currentValue: number;
    previousValue: number;
    absoluteChange: number;
    changeRatio: number | null;
    direction: "up" | "down" | "flat";
    label: string;
}

export interface InsightsRatioMetric {
    value: number;
    numerator: number;
    denominator: number;
    label: string;
}

export interface InsightsContentMetrics {
    completionRate: InsightsRatioMetric;
    savesPerReader: InsightsRatioMetric;
    highlightsPerReader: InsightsRatioMetric;
    feedbackRate: InsightsRatioMetric;
    averageReadingTimePerReader: InsightsRatioMetric;
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

export interface DecisionContentInsight {
    id: string;
    title: string;
    author: string | null;
    type: ContentRow["type"];
    createdAt: string;
    readerCount: number;
    durationSeconds: number;
    saveCount: number;
    highlightCount: number;
    positiveFeedbackCount: number;
    negativeFeedbackCount: number;
    totalFeedbackCount: number;
    progressCount: number;
    completedCount: number;
    completionRate: number;
    savesPerReader: number;
    averageReadingTimePerReader: number;
    engagementScore: number;
    attentionReason: string | null;
}

export interface DecisionTablesData {
    mostEngagingContent: DecisionContentInsight[];
    highTrafficLowCompletion: DecisionContentInsight[];
    highSaves: DecisionContentInsight[];
    needsAttention: DecisionContentInsight[];
    recentlyPublishedPerformance: DecisionContentInsight[];
}

export interface AdminInsightsData {
    range: InsightsRange;
    days: number;
    startDate: string;
    previousStartDate: string;
    cards: InsightsCardData[];
    contentMetrics: InsightsContentMetrics;
    topByDuration: RankedContentInsight[];
    topByReaders: RankedContentInsight[];
    feedbackSummary: FeedbackInsight[];
    decisionTables: DecisionTablesData;
}

interface ContentAggregate {
    durationSeconds: number;
    readerCount: number;
}

interface ContentDecisionAggregate extends ContentAggregate {
    saveCount: number;
    highlightCount: number;
    positiveFeedbackCount: number;
    negativeFeedbackCount: number;
    progressCount: number;
    completedCount: number;
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

function addUtcDays(dateString: string, days: number): string {
    const date = new Date(`${dateString}T00:00:00.000Z`);
    date.setUTCDate(date.getUTCDate() + days);
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

function buildTrend(
    currentValue: number,
    previousValue: number,
    label: string
): InsightsTrendData {
    const absoluteChange = currentValue - previousValue;

    return {
        currentValue,
        previousValue,
        absoluteChange,
        changeRatio: previousValue > 0 ? absoluteChange / previousValue : null,
        direction: absoluteChange > 0 ? "up" : absoluteChange < 0 ? "down" : "flat",
        label,
    };
}

function buildRatioMetric(
    numerator: number,
    denominator: number,
    label: string
): InsightsRatioMetric {
    return {
        value: denominator > 0 ? numerator / denominator : 0,
        numerator,
        denominator,
        label,
    };
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasMeaningfulProgress(progress: unknown) {
    if (!isRecord(progress)) return false;

    return (
        progress.isCompleted === true
        || (Array.isArray(progress.completed) && progress.completed.length > 0)
        || typeof progress.completedAt === "string"
        || typeof progress.lastReadAt === "string"
        || typeof progress.maxSegmentIndex === "number"
        || typeof progress.lastSegmentIndex === "number"
    );
}

function isCompletedProgress(progress: unknown) {
    return isRecord(progress) && progress.isCompleted === true;
}

function countCurrentBookmarks(rows: UserLibraryRow[]) {
    return rows.filter((row) => row.is_bookmarked).length;
}

function countCompletedRows(rows: UserLibraryRow[]) {
    return rows.filter((row) => isCompletedProgress(row.progress)).length;
}

function countProgressRows(rows: UserLibraryRow[]) {
    return rows.filter((row) => hasMeaningfulProgress(row.progress)).length;
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
        .select("id, title, author, type, created_at, status, deleted_at")
        .in("id", contentIds)
        .eq("status", "verified")
        .is("deleted_at", null);

    if (error) {
        throw error;
    }

    return (data ?? []) as InsightsContentRow[];
}

async function fetchRecentlyPublishedContent(startTimestamp: string): Promise<InsightsContentRow[]> {
    const supabase = getAdminClient();
    const { data, error } = await supabase
        .from("content_item")
        .select("id, title, author, type, created_at, status, deleted_at")
        .gte("created_at", startTimestamp)
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

function getOrCreateDecisionAggregate(
    aggregates: Map<string, ContentDecisionAggregate>,
    contentId: string
) {
    const current = aggregates.get(contentId) ?? {
        durationSeconds: 0,
        readerCount: 0,
        saveCount: 0,
        highlightCount: 0,
        positiveFeedbackCount: 0,
        negativeFeedbackCount: 0,
        progressCount: 0,
        completedCount: 0,
    };

    aggregates.set(contentId, current);
    return current;
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

function applyAttentionReasons(
    rows: DecisionContentInsight[],
    highTrafficThreshold: number
) {
    return rows.map((row) => ({
        ...row,
        attentionReason:
            row.attentionReason
            || (row.readerCount >= highTrafficThreshold && row.progressCount > 0 && row.completionRate < 0.6
                ? `${Math.round(row.completionRate * 100)}% completion on high traffic`
                : null),
    }));
}

function buildDecisionRows(
    items: InsightsContentRow[],
    activityRows: ContentReadingActivityRow[],
    libraryRows: UserLibraryRow[],
    highlightRows: UserHighlightRow[],
    feedbackRows: ContentFeedbackRow[],
    startTimestamp: string
): DecisionContentInsight[] {
    const aggregates = new Map<string, ContentDecisionAggregate>();

    for (const row of activityRows) {
        const current = getOrCreateDecisionAggregate(aggregates, row.content_id);
        current.durationSeconds += row.duration_seconds;
        current.readerCount += row.reader_count;
    }

    for (const row of libraryRows) {
        const current = getOrCreateDecisionAggregate(aggregates, row.content_id);
        if (row.is_bookmarked) current.saveCount += 1;
        if (hasMeaningfulProgress(row.progress)) current.progressCount += 1;
        if (isCompletedProgress(row.progress)) current.completedCount += 1;
    }

    for (const row of highlightRows) {
        const current = getOrCreateDecisionAggregate(aggregates, row.content_item_id);
        current.highlightCount += 1;
    }

    for (const row of feedbackRows) {
        const current = getOrCreateDecisionAggregate(aggregates, row.content_id);
        if (row.is_positive) {
            current.positiveFeedbackCount += 1;
        } else {
            current.negativeFeedbackCount += 1;
        }
    }

    const rows = items.map((item) => {
        const aggregate = aggregates.get(item.id) ?? {
            durationSeconds: 0,
            readerCount: 0,
            saveCount: 0,
            highlightCount: 0,
            positiveFeedbackCount: 0,
            negativeFeedbackCount: 0,
            progressCount: 0,
            completedCount: 0,
        };
        const completionRate = aggregate.progressCount > 0
            ? aggregate.completedCount / aggregate.progressCount
            : 0;
        const savesPerReader = aggregate.readerCount > 0
            ? aggregate.saveCount / aggregate.readerCount
            : 0;
        const averageReadingTimePerReader = aggregate.readerCount > 0
            ? aggregate.durationSeconds / aggregate.readerCount
            : 0;
        const totalFeedbackCount = aggregate.positiveFeedbackCount + aggregate.negativeFeedbackCount;
        const engagementScore =
            aggregate.readerCount
            + aggregate.durationSeconds / 300
            + aggregate.saveCount * 3
            + aggregate.highlightCount * 2
            + totalFeedbackCount * 2;

        let attentionReason: string | null = null;
        if (aggregate.negativeFeedbackCount > 0) {
            attentionReason = `${aggregate.negativeFeedbackCount.toLocaleString()} negative feedback`;
        } else if (aggregate.progressCount > 0 && completionRate < 0.5) {
            attentionReason = `${Math.round(completionRate * 100)}% completion`;
        } else if (
            aggregate.readerCount > 0
            && aggregate.saveCount + aggregate.highlightCount + totalFeedbackCount === 0
        ) {
            attentionReason = "Traffic without saves, highlights, or feedback";
        }

        return {
            id: item.id,
            title: item.title,
            author: item.author,
            type: item.type,
            createdAt: item.created_at,
            readerCount: aggregate.readerCount,
            durationSeconds: aggregate.durationSeconds,
            saveCount: aggregate.saveCount,
            highlightCount: aggregate.highlightCount,
            positiveFeedbackCount: aggregate.positiveFeedbackCount,
            negativeFeedbackCount: aggregate.negativeFeedbackCount,
            totalFeedbackCount,
            progressCount: aggregate.progressCount,
            completedCount: aggregate.completedCount,
            completionRate,
            savesPerReader,
            averageReadingTimePerReader,
            engagementScore,
            attentionReason,
        };
    });
    return rows.filter((row) => (
            row.readerCount > 0
            || row.saveCount > 0
            || row.highlightCount > 0
            || row.totalFeedbackCount > 0
            || new Date(row.createdAt).getTime() >= new Date(startTimestamp).getTime()
    ));
}

function buildDecisionTables(
    rows: DecisionContentInsight[],
    startTimestamp: string,
    highTrafficThreshold: number
): DecisionTablesData {
    return {
        mostEngagingContent: [...rows]
            .filter((row) => row.engagementScore > 0)
            .sort((a, b) => b.engagementScore - a.engagementScore || a.title.localeCompare(b.title))
            .slice(0, 5),
        highTrafficLowCompletion: [...rows]
            .filter((row) => (
                row.readerCount >= highTrafficThreshold
                && row.progressCount > 0
                && row.completionRate < 0.6
            ))
            .sort((a, b) => (
                b.readerCount - a.readerCount
                || a.completionRate - b.completionRate
                || a.title.localeCompare(b.title)
            ))
            .slice(0, 5),
        highSaves: [...rows]
            .filter((row) => row.saveCount > 0)
            .sort((a, b) => (
                b.saveCount - a.saveCount
                || b.savesPerReader - a.savesPerReader
                || a.title.localeCompare(b.title)
            ))
            .slice(0, 5),
        needsAttention: [...rows]
            .filter((row) => row.attentionReason)
            .sort((a, b) => (
                b.negativeFeedbackCount - a.negativeFeedbackCount
                || b.readerCount - a.readerCount
                || a.completionRate - b.completionRate
                || a.title.localeCompare(b.title)
            ))
            .slice(0, 5),
        recentlyPublishedPerformance: [...rows]
            .filter((row) => new Date(row.createdAt).getTime() >= new Date(startTimestamp).getTime())
            .sort((a, b) => (
                new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
                || b.engagementScore - a.engagementScore
                || a.title.localeCompare(b.title)
            ))
            .slice(0, 5),
    };
}

export async function getAdminInsights(range: InsightsRange): Promise<AdminInsightsData> {
    const days = getRangeDays(range);
    const startDate = getUtcDateDaysAgoInclusive(days);
    const previousStartDate = addUtcDays(startDate, -days);
    const startTimestamp = getStartTimestamp(startDate);
    const previousStartTimestamp = getStartTimestamp(previousStartDate);
    const supabase = getAdminClient();
    const internalUserIds = await fetchInternalUserIds();
    const internalUserFilter = internalUserIds.length > 0 ? buildNotInFilter(internalUserIds) : null;

    let bookmarksQuery = supabase
        .from("user_library")
        .select("content_id", { count: "exact", head: true })
        .eq("is_bookmarked", true);

    let currentLibraryRowsQuery = supabase
        .from("user_library")
        .select("content_id, is_bookmarked, progress, last_interacted_at, user_id")
        .gte("last_interacted_at", startTimestamp);

    let previousLibraryRowsQuery = supabase
        .from("user_library")
        .select("content_id, is_bookmarked, progress, last_interacted_at, user_id")
        .gte("last_interacted_at", previousStartTimestamp)
        .lt("last_interacted_at", startTimestamp);

    let highlightsQuery = supabase
        .from("user_highlights")
        .select("id, content_item_id, created_at, user_id")
        .gte("created_at", startTimestamp);

    let previousHighlightsQuery = supabase
        .from("user_highlights")
        .select("id", { count: "exact", head: true })
        .gte("created_at", previousStartTimestamp)
        .lt("created_at", startTimestamp);

    let feedbackQuery = supabase
        .from("content_feedback")
        .select("content_id, is_positive, created_at, user_id")
        .gte("created_at", startTimestamp);

    let previousFeedbackQuery = supabase
        .from("content_feedback")
        .select("content_id, is_positive, created_at, user_id")
        .gte("created_at", previousStartTimestamp)
        .lt("created_at", startTimestamp);

    if (internalUserFilter) {
        bookmarksQuery = bookmarksQuery.not("user_id", "in", internalUserFilter);
        currentLibraryRowsQuery = currentLibraryRowsQuery.not("user_id", "in", internalUserFilter);
        previousLibraryRowsQuery = previousLibraryRowsQuery.not("user_id", "in", internalUserFilter);
        highlightsQuery = highlightsQuery.not("user_id", "in", internalUserFilter);
        previousHighlightsQuery = previousHighlightsQuery.not("user_id", "in", internalUserFilter);
        feedbackQuery = feedbackQuery.not("user_id", "in", internalUserFilter);
        previousFeedbackQuery = previousFeedbackQuery.not("user_id", "in", internalUserFilter);
    }

    const [
        contentActivityResult,
        previousContentActivityResult,
        bookmarksResult,
        currentLibraryRowsResult,
        previousLibraryRowsResult,
        highlightsResult,
        previousHighlightsResult,
        feedbackResult,
        previousFeedbackResult,
    ] = await Promise.all([
        supabase
            .from("content_reading_activity")
            .select("content_id, duration_seconds, reader_count, activity_date")
            .gte("activity_date", startDate),
        supabase
            .from("content_reading_activity")
            .select("content_id, duration_seconds, reader_count, activity_date")
            .gte("activity_date", previousStartDate)
            .lt("activity_date", startDate),
        bookmarksQuery,
        currentLibraryRowsQuery,
        previousLibraryRowsQuery,
        highlightsQuery,
        previousHighlightsQuery,
        feedbackQuery,
        previousFeedbackQuery,
    ]);

    if (contentActivityResult.error) throw contentActivityResult.error;
    if (previousContentActivityResult.error) throw previousContentActivityResult.error;
    if (bookmarksResult.error) throw bookmarksResult.error;
    if (currentLibraryRowsResult.error) throw currentLibraryRowsResult.error;
    if (previousLibraryRowsResult.error) throw previousLibraryRowsResult.error;
    if (highlightsResult.error) throw highlightsResult.error;
    if (previousHighlightsResult.error) throw previousHighlightsResult.error;
    if (feedbackResult.error) throw feedbackResult.error;
    if (previousFeedbackResult.error) throw previousFeedbackResult.error;

    const contentActivityRows = (contentActivityResult.data ?? []) as ContentReadingActivityRow[];
    const previousContentActivityRows = (previousContentActivityResult.data ?? []) as ContentReadingActivityRow[];
    const currentLibraryRows = (currentLibraryRowsResult.data ?? []) as UserLibraryRow[];
    const previousLibraryRows = (previousLibraryRowsResult.data ?? []) as UserLibraryRow[];
    const feedbackRows = (feedbackResult.data ?? []) as ContentFeedbackRow[];
    const highlightRows = (highlightsResult.data ?? []) as UserHighlightRow[];
    const contentIds = Array.from(
        new Set([
            ...contentActivityRows.map((row) => row.content_id),
            ...feedbackRows.map((row) => row.content_id),
            ...currentLibraryRows.map((row) => row.content_id),
            ...highlightRows.map((row) => row.content_item_id),
        ])
    );
    const [contentItems, recentlyPublishedContentItems] = await Promise.all([
        fetchContentItems(contentIds),
        fetchRecentlyPublishedContent(startTimestamp),
    ]);
    const allContentItems = Array.from(
        new Map(
            [...contentItems, ...recentlyPublishedContentItems].map((item) => [item.id, item])
        ).values()
    );
    const contentMap = buildContentMap(contentItems);
    const aggregates = aggregateContentActivity(contentActivityRows);

    const totalReaders = contentActivityRows.reduce((sum, row) => sum + row.reader_count, 0);
    const totalReadingTimeSeconds = contentActivityRows.reduce(
        (sum, row) => sum + row.duration_seconds,
        0
    );
    const previousReaders = previousContentActivityRows.reduce((sum, row) => sum + row.reader_count, 0);
    const previousReadingTimeSeconds = previousContentActivityRows.reduce(
        (sum, row) => sum + row.duration_seconds,
        0
    );
    const totalBookmarks = bookmarksResult.count ?? 0;
    const currentPeriodSaves = countCurrentBookmarks(currentLibraryRows);
    const previousPeriodSaves = countCurrentBookmarks(previousLibraryRows);
    const totalHighlights = highlightRows.length;
    const previousHighlights = previousHighlightsResult.count ?? 0;
    const currentFeedbackCount = feedbackRows.length;
    const currentProgressRows = countProgressRows(currentLibraryRows);
    const currentCompletedRows = countCompletedRows(currentLibraryRows);
    const decisionRows = buildDecisionRows(
        allContentItems,
        contentActivityRows,
        currentLibraryRows,
        highlightRows,
        feedbackRows,
        startTimestamp
    );
    const highTrafficThreshold = Math.max(
        2,
        Math.ceil(Math.max(0, ...decisionRows.map((row) => row.readerCount)) * 0.25)
    );
    const decisionRowsWithAttentionReasons = applyAttentionReasons(decisionRows, highTrafficThreshold);

    return {
        range,
        days,
        startDate,
        previousStartDate,
        cards: [
            {
                title: `Readers (${days}d)`,
                value: totalReaders.toLocaleString(),
                detail: "Unique reader-days across all content, including guest visitors",
                trend: buildTrend(totalReaders, previousReaders, "Reader-days vs previous period"),
            },
            {
                title: `Reading Time (${days}d)`,
                value: formatReadingTime(totalReadingTimeSeconds),
                detail: `${totalReadingTimeSeconds.toLocaleString()} seconds captured from signed-in and guest readers`,
                trend: buildTrend(
                    totalReadingTimeSeconds,
                    previousReadingTimeSeconds,
                    "Reading time vs previous period"
                ),
            },
            {
                title: "Bookmarks",
                value: totalBookmarks.toLocaleString(),
                detail: "Current saved items across signed-in users",
                trend: buildTrend(currentPeriodSaves, previousPeriodSaves, "New saves vs previous period"),
            },
            {
                title: `Highlights (${days}d)`,
                value: totalHighlights.toLocaleString(),
                detail: "Created by signed-in users within the selected range",
                trend: buildTrend(totalHighlights, previousHighlights, "Highlights vs previous period"),
            },
        ],
        contentMetrics: {
            completionRate: buildRatioMetric(
                currentCompletedRows,
                currentProgressRows,
                "Completed signed-in progress rows divided by signed-in progress rows touched in the selected range"
            ),
            savesPerReader: buildRatioMetric(
                currentPeriodSaves,
                totalReaders,
                "Current-period saves divided by reader-days"
            ),
            highlightsPerReader: buildRatioMetric(
                totalHighlights,
                totalReaders,
                "Current-period highlights divided by reader-days"
            ),
            feedbackRate: buildRatioMetric(
                currentFeedbackCount,
                totalReaders,
                "Current-period feedback submissions divided by reader-days"
            ),
            averageReadingTimePerReader: buildRatioMetric(
                totalReadingTimeSeconds,
                totalReaders,
                "Current-period captured reading seconds divided by reader-days"
            ),
        },
        topByDuration: buildRankedContent(aggregates, contentMap, "duration"),
        topByReaders: buildRankedContent(aggregates, contentMap, "readers"),
        feedbackSummary: buildFeedbackSummary(feedbackRows, contentMap),
        decisionTables: buildDecisionTables(
            decisionRowsWithAttentionReasons,
            startTimestamp,
            highTrafficThreshold
        ),
    };
}
