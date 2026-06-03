import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import AdminInsightsPage from "@/app/admin/insights/page";
import { getAdminInsights, type AdminInsightsData } from "@/lib/admin/insights";

vi.mock("next/link", () => ({
    default: ({ children, href, ...props }: any) => (
        <a href={href} {...props}>
            {children}
        </a>
    ),
}));

vi.mock("@/lib/admin/insights", () => ({
    getAdminInsights: vi.fn(),
}));

const emptyContentMetrics = {
    completionRate: {
        value: 0,
        numerator: 0,
        denominator: 0,
        label: "Completed signed-in progress rows divided by signed-in progress rows touched in the selected range",
    },
    savesPerReader: {
        value: 0,
        numerator: 0,
        denominator: 0,
        label: "Current-period saves divided by reader-days",
    },
    highlightsPerReader: {
        value: 0,
        numerator: 0,
        denominator: 0,
        label: "Current-period highlights divided by reader-days",
    },
    feedbackRate: {
        value: 0,
        numerator: 0,
        denominator: 0,
        label: "Current-period feedback submissions divided by reader-days",
    },
    averageReadingTimePerReader: {
        value: 0,
        numerator: 0,
        denominator: 0,
        label: "Current-period captured reading seconds divided by reader-days",
    },
} satisfies AdminInsightsData["contentMetrics"];

const populatedInsights = {
    range: "7d",
    days: 7,
    startDate: "2026-03-05",
    previousStartDate: "2026-02-26",
    cards: [
        {
            title: "Readers (7d)",
            value: "42",
            detail: "Unique reader-days across all content",
            trend: {
                currentValue: 42,
                previousValue: 28,
                absoluteChange: 14,
                changeRatio: 0.5,
                direction: "up",
                label: "Reader-days vs previous period",
            },
        },
        {
            title: "Reading Time (7d)",
            value: "3h 10m",
            detail: "11,400 seconds captured",
            trend: {
                currentValue: 11400,
                previousValue: 12000,
                absoluteChange: -600,
                changeRatio: -0.05,
                direction: "down",
                label: "Reading time vs previous period",
            },
        },
        {
            title: "Bookmarks",
            value: "19",
            detail: "Current saved items across users",
            trend: {
                currentValue: 10,
                previousValue: 10,
                absoluteChange: 0,
                changeRatio: 0,
                direction: "flat",
                label: "New saves vs previous period",
            },
        },
        {
            title: "Highlights (7d)",
            value: "8",
            detail: "Created within the selected range",
            trend: {
                currentValue: 8,
                previousValue: 4,
                absoluteChange: 4,
                changeRatio: 1,
                direction: "up",
                label: "Highlights vs previous period",
            },
        },
    ],
    contentMetrics: {
        completionRate: {
            value: 0.6,
            numerator: 12,
            denominator: 20,
            label: "Completed signed-in progress rows divided by signed-in progress rows touched in the selected range",
        },
        savesPerReader: {
            value: 0.25,
            numerator: 10,
            denominator: 40,
            label: "Current-period saves divided by reader-days",
        },
        highlightsPerReader: {
            value: 0.2,
            numerator: 8,
            denominator: 40,
            label: "Current-period highlights divided by reader-days",
        },
        feedbackRate: {
            value: 0.125,
            numerator: 5,
            denominator: 40,
            label: "Current-period feedback submissions divided by reader-days",
        },
        averageReadingTimePerReader: {
            value: 285,
            numerator: 11400,
            denominator: 40,
            label: "Current-period captured reading seconds divided by reader-days",
        },
    },
    topByDuration: [
        {
            id: "content-1",
            title: "Alpha",
            author: "Author A",
            type: "article",
            durationSeconds: 5400,
            readerCount: 11,
        },
        {
            id: "content-2",
            title: "Beta",
            author: "Author B",
            type: "podcast",
            durationSeconds: 3600,
            readerCount: 9,
        },
    ],
    topByReaders: [
        {
            id: "content-2",
            title: "Beta",
            author: "Author B",
            type: "podcast",
            durationSeconds: 3600,
            readerCount: 14,
        },
    ],
    feedbackSummary: [
        {
            id: "content-1",
            title: "Alpha",
            positiveCount: 4,
            negativeCount: 1,
            totalCount: 5,
        },
    ],
    decisionTables: {
        mostEngagingContent: [
            {
                id: "content-1",
                title: "Alpha",
                author: "Author A",
                type: "article",
                createdAt: "2026-03-10T00:00:00.000Z",
                readerCount: 42,
                durationSeconds: 11400,
                saveCount: 10,
                highlightCount: 8,
                positiveFeedbackCount: 4,
                negativeFeedbackCount: 1,
                totalFeedbackCount: 5,
                progressCount: 20,
                completedCount: 12,
                completionRate: 0.6,
                savesPerReader: 0.25,
                averageReadingTimePerReader: 285,
                engagementScore: 126,
                attentionReason: "1 negative feedback",
            },
        ],
        highTrafficLowCompletion: [
            {
                id: "content-2",
                title: "Beta",
                author: "Author B",
                type: "podcast",
                createdAt: "2026-03-08T00:00:00.000Z",
                readerCount: 14,
                durationSeconds: 3600,
                saveCount: 1,
                highlightCount: 1,
                positiveFeedbackCount: 0,
                negativeFeedbackCount: 0,
                totalFeedbackCount: 0,
                progressCount: 10,
                completedCount: 3,
                completionRate: 0.3,
                savesPerReader: 1 / 14,
                averageReadingTimePerReader: 3600 / 14,
                engagementScore: 31,
                attentionReason: "30% completion on high traffic",
            },
        ],
        highSaves: [
            {
                id: "content-1",
                title: "Alpha",
                author: "Author A",
                type: "article",
                createdAt: "2026-03-10T00:00:00.000Z",
                readerCount: 42,
                durationSeconds: 11400,
                saveCount: 10,
                highlightCount: 8,
                positiveFeedbackCount: 4,
                negativeFeedbackCount: 1,
                totalFeedbackCount: 5,
                progressCount: 20,
                completedCount: 12,
                completionRate: 0.6,
                savesPerReader: 0.25,
                averageReadingTimePerReader: 285,
                engagementScore: 126,
                attentionReason: "1 negative feedback",
            },
        ],
        needsAttention: [
            {
                id: "content-1",
                title: "Alpha",
                author: "Author A",
                type: "article",
                createdAt: "2026-03-10T00:00:00.000Z",
                readerCount: 42,
                durationSeconds: 11400,
                saveCount: 10,
                highlightCount: 8,
                positiveFeedbackCount: 4,
                negativeFeedbackCount: 1,
                totalFeedbackCount: 5,
                progressCount: 20,
                completedCount: 12,
                completionRate: 0.6,
                savesPerReader: 0.25,
                averageReadingTimePerReader: 285,
                engagementScore: 126,
                attentionReason: "1 negative feedback",
            },
        ],
        recentlyPublishedPerformance: [
            {
                id: "content-1",
                title: "Alpha",
                author: "Author A",
                type: "article",
                createdAt: "2026-03-10T00:00:00.000Z",
                readerCount: 42,
                durationSeconds: 11400,
                saveCount: 10,
                highlightCount: 8,
                positiveFeedbackCount: 4,
                negativeFeedbackCount: 1,
                totalFeedbackCount: 5,
                progressCount: 20,
                completedCount: 12,
                completionRate: 0.6,
                savesPerReader: 0.25,
                averageReadingTimePerReader: 285,
                engagementScore: 126,
                attentionReason: "1 negative feedback",
            },
        ],
    },
} satisfies AdminInsightsData;

const emptyInsights = {
    range: "30d",
    days: 30,
    startDate: "2026-02-11",
    previousStartDate: "2026-01-12",
    cards: [
        { title: "Readers (30d)", value: "0", detail: "Unique reader-days across all content" },
        { title: "Reading Time (30d)", value: "0 min", detail: "0 seconds captured" },
        { title: "Bookmarks", value: "0", detail: "Current saved items across users" },
        { title: "Highlights (30d)", value: "0", detail: "Created within the selected range" },
    ],
    contentMetrics: emptyContentMetrics,
    topByDuration: [],
    topByReaders: [],
    feedbackSummary: [],
    decisionTables: {
        mostEngagingContent: [],
        highTrafficLowCompletion: [],
        highSaves: [],
        needsAttention: [],
        recentlyPublishedPerformance: [],
    },
} satisfies AdminInsightsData;

describe("Admin Insights Page", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        delete process.env.NEXT_PUBLIC_POSTHOG_PROJECT_URL;
        delete process.env.NEXT_PUBLIC_POSTHOG_UI_HOST;
    });

    it("renders KPI cards and ranked tables for the selected range", async () => {
        vi.mocked(getAdminInsights).mockResolvedValue(populatedInsights);

        process.env.NEXT_PUBLIC_POSTHOG_PROJECT_URL = "https://us.posthog.com/project/450488";

        render(await AdminInsightsPage({ searchParams: Promise.resolve({ range: "7d" }) }));

        expect(screen.getByText("Content Insights")).toBeInTheDocument();
        expect(screen.getByText(/Editorial performance for published content/i)).toBeInTheDocument();
        expect(screen.getByRole("link", { name: /open product analytics/i })).toHaveAttribute(
            "href",
            "https://us.posthog.com/project/450488"
        );
        expect(screen.getByText("Readers (7d)")).toBeInTheDocument();
        expect(screen.getByText("3h 10m")).toBeInTheDocument();
        expect(screen.getByText("+14 (50%)")).toBeInTheDocument();
        expect(screen.getByText("Completion Rate")).toBeInTheDocument();
        expect(screen.queryByText("Completion rate")).not.toBeInTheDocument();
        expect(screen.getAllByText("60%").length).toBeGreaterThan(0);
        expect(screen.getByText("Feedback Rate")).toBeInTheDocument();
        expect(screen.getAllByText("13%").length).toBeGreaterThan(0);
        expect(screen.getByText("Highlights / Reader")).toBeInTheDocument();
        expect(screen.queryByText("Highlights / reader")).not.toBeInTheDocument();
        expect(screen.getAllByText("0.2").length).toBeGreaterThan(0);
        expect(screen.getByText("Avg Time / Reader")).toBeInTheDocument();
        expect(screen.queryByText("Avg / reader")).not.toBeInTheDocument();
        expect(screen.getAllByText("5 min").length).toBeGreaterThan(0);
        expect(screen.getByText("Most Engaging Content")).toBeInTheDocument();
        expect(screen.getByText(/Blended score: readers \+ time per 5 min/i)).toBeInTheDocument();
        expect(screen.getByText("High Traffic, Low Completion")).toBeInTheDocument();
        expect(screen.getByText("High Saves")).toBeInTheDocument();
        expect(screen.getByText("Needs Attention")).toBeInTheDocument();
        expect(screen.getByText("Recently Published Performance")).toBeInTheDocument();
        expect(screen.getByText("Score 126")).toBeInTheDocument();
        expect(screen.getByText("30% completion")).toBeInTheDocument();
        expect(screen.getAllByText("Alpha").length).toBeGreaterThan(0);
        expect(screen.getAllByText("Beta").length).toBeGreaterThan(0);
        expect(screen.getByText("Feedback Summary")).toBeInTheDocument();
        expect(getAdminInsights).toHaveBeenCalledWith("7d");
    });

    it("falls back to PostHog UI host when project URL is absent", async () => {
        vi.mocked(getAdminInsights).mockResolvedValue(populatedInsights);
        process.env.NEXT_PUBLIC_POSTHOG_UI_HOST = "https://us.posthog.com";

        render(await AdminInsightsPage({ searchParams: Promise.resolve({ range: "7d" }) }));

        expect(screen.getByRole("link", { name: /open product analytics/i })).toHaveAttribute(
            "href",
            "https://us.posthog.com"
        );
    });

    it("renders empty states when there is no insight data", async () => {
        vi.mocked(getAdminInsights).mockResolvedValue(emptyInsights);

        render(await AdminInsightsPage({ searchParams: Promise.resolve({ range: "30d" }) }));

        expect(screen.getByText("Readers (30d)")).toBeInTheDocument();
        expect(screen.getByText("No reading activity data yet for this range.")).toBeInTheDocument();
        expect(screen.getByText("No reader activity data yet for this range.")).toBeInTheDocument();
        expect(screen.getByText("No feedback data yet for this range.")).toBeInTheDocument();
        expect(screen.getByText("No engagement data yet for this range.")).toBeInTheDocument();
        expect(screen.getByText("No low completion data yet for this range.")).toBeInTheDocument();
        expect(screen.getByText("No saves data yet for this range.")).toBeInTheDocument();
        expect(screen.getByText("No attention data yet for this range.")).toBeInTheDocument();
        expect(screen.getByText("No recently published data yet for this range.")).toBeInTheDocument();
        expect(screen.queryByRole("link", { name: /open product analytics/i })).not.toBeInTheDocument();
        expect(getAdminInsights).toHaveBeenCalledWith("30d");
    });
});
