import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import AdminInsightsPage from "@/app/admin/insights/page";
import { getAdminInsights } from "@/lib/admin/insights";

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

describe("Admin Insights Page", () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it("renders KPI cards and ranked tables for the selected range", async () => {
        (getAdminInsights as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
            range: "7d",
            days: 7,
            startDate: "2026-03-05",
            cards: [
                { title: "Readers (7d)", value: "42", detail: "Unique reader-days across all content" },
                { title: "Reading Time (7d)", value: "3h 10m", detail: "11,400 seconds captured" },
                { title: "Bookmarks", value: "19", detail: "Current saved items across users" },
                { title: "Highlights (7d)", value: "8", detail: "Created within the selected range" },
            ],
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
        });

        render(await AdminInsightsPage({ searchParams: Promise.resolve({ range: "7d" }) }));

        expect(screen.getByText("Insights")).toBeInTheDocument();
        expect(screen.getByText("Readers (7d)")).toBeInTheDocument();
        expect(screen.getByText("3h 10m")).toBeInTheDocument();
        expect(screen.getAllByText("Alpha").length).toBeGreaterThan(0);
        expect(screen.getAllByText("Beta").length).toBeGreaterThan(0);
        expect(screen.getByText("Feedback Summary")).toBeInTheDocument();
    });

    it("renders empty states when there is no insight data", async () => {
        (getAdminInsights as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
            range: "30d",
            days: 30,
            startDate: "2026-02-11",
            cards: [
                { title: "Readers (30d)", value: "0", detail: "Unique reader-days across all content" },
                { title: "Reading Time (30d)", value: "0 min", detail: "0 seconds captured" },
                { title: "Bookmarks", value: "0", detail: "Current saved items across users" },
                { title: "Highlights (30d)", value: "0", detail: "Created within the selected range" },
            ],
            topByDuration: [],
            topByReaders: [],
            feedbackSummary: [],
        });

        render(await AdminInsightsPage({ searchParams: Promise.resolve({ range: "30d" }) }));

        expect(screen.getByText("No reading activity data yet for this range.")).toBeInTheDocument();
        expect(screen.getByText("No reader activity data yet for this range.")).toBeInTheDocument();
        expect(screen.getByText("No feedback data yet for this range.")).toBeInTheDocument();
    });
});
