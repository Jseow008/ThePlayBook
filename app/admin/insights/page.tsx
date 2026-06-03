import Link from "next/link";
import {
    ArrowDownRight,
    ArrowRight,
    ArrowUpRight,
    BarChart3,
    Bookmark,
    Clock3,
    ExternalLink,
    Highlighter,
    MessageSquareText,
    Percent,
    Timer,
    Users,
} from "lucide-react";
import {
    getAdminInsights,
    type DecisionContentInsight,
    type InsightsCardData,
    type InsightsRange,
} from "@/lib/admin/insights";

const RANGE_OPTIONS: Array<{ value: InsightsRange; label: string }> = [
    { value: "7d", label: "Last 7 days" },
    { value: "30d", label: "Last 30 days" },
];

const cardIcons = [Users, Clock3, Bookmark, Highlighter];

type TrendDirection = NonNullable<InsightsCardData["trend"]>["direction"];
type DecisionTableKind =
    | "engaging"
    | "completion"
    | "saves"
    | "attention"
    | "recent";

function getPostHogAnalyticsUrl() {
    return process.env.NEXT_PUBLIC_POSTHOG_PROJECT_URL || process.env.NEXT_PUBLIC_POSTHOG_UI_HOST;
}

function formatDuration(seconds: number): string {
    const minutes = Math.round(seconds / 60);
    if (minutes < 60) return `${minutes} min`;

    const hours = Math.floor(minutes / 60);
    const remainingMinutes = minutes % 60;

    if (remainingMinutes === 0) return `${hours} hr`;
    return `${hours}h ${remainingMinutes}m`;
}

function formatPercent(value: number): string {
    return `${Math.round(value * 100)}%`;
}

function formatRate(value: number): string {
    if (value === 0) return "0";
    if (value < 0.1) return value.toFixed(2);
    return value.toFixed(1);
}

function formatDate(value: string): string {
    return new Intl.DateTimeFormat("en", {
        month: "short",
        day: "numeric",
    }).format(new Date(value));
}

function formatTrendValue(card: InsightsCardData): string {
    const trend = card.trend;
    if (!trend) return "No prior data";

    const prefix = trend.absoluteChange > 0 ? "+" : "";
    const ratio = trend.changeRatio === null ? null : formatPercent(Math.abs(trend.changeRatio));
    const change = `${prefix}${trend.absoluteChange.toLocaleString()}`;

    return ratio ? `${change} (${ratio})` : change;
}

function getTrendTone(direction: TrendDirection) {
    if (direction === "up") return "border-emerald-200 bg-emerald-50 text-emerald-700";
    if (direction === "down") return "border-rose-200 bg-rose-50 text-rose-700";
    return "border-zinc-200 bg-zinc-50 text-zinc-600";
}

function TrendIcon({ direction }: { direction: TrendDirection }) {
    if (direction === "up") return <ArrowUpRight className="h-3.5 w-3.5" />;
    if (direction === "down") return <ArrowDownRight className="h-3.5 w-3.5" />;
    return <ArrowRight className="h-3.5 w-3.5" />;
}

function TableEmptyState({ label }: { label: string }) {
    return (
        <div className="px-6 py-10 text-sm text-zinc-500">
            No {label.toLowerCase()} data yet for this range.
        </div>
    );
}

function getDecisionSignal(row: DecisionContentInsight, kind: DecisionTableKind): string {
    if (kind === "engaging") return `Score ${Math.round(row.engagementScore).toLocaleString()}`;
    if (kind === "completion") return `${formatPercent(row.completionRate)} completion`;
    if (kind === "saves") return `${row.saveCount.toLocaleString()} saves`;
    if (kind === "attention") return row.attentionReason ?? "Review";
    return `Published ${formatDate(row.createdAt)}`;
}

function getDecisionDetail(row: DecisionContentInsight, kind: DecisionTableKind): string {
    if (kind === "engaging") {
        return `${formatDuration(row.durationSeconds)} read · ${row.saveCount.toLocaleString()} saves · ${row.highlightCount.toLocaleString()} highlights`;
    }

    if (kind === "completion") {
        return `${row.completedCount.toLocaleString()} of ${row.progressCount.toLocaleString()} signed-in reads completed`;
    }

    if (kind === "saves") {
        return `${formatRate(row.savesPerReader)} saves per reader-day`;
    }

    if (kind === "attention") {
        return `${row.negativeFeedbackCount.toLocaleString()} negative · ${formatPercent(row.completionRate)} completion`;
    }

    return `${formatDuration(row.durationSeconds)} read · ${row.saveCount.toLocaleString()} saves · ${row.highlightCount.toLocaleString()} highlights`;
}

function DecisionTable({
    title,
    description,
    emptyLabel,
    rows,
    kind,
}: {
    title: string;
    description: string;
    emptyLabel: string;
    rows: DecisionContentInsight[];
    kind: DecisionTableKind;
}) {
    return (
        <section className="overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-sm">
            <div className="border-b border-zinc-200 px-6 py-4">
                <h2 className="font-semibold text-zinc-900">{title}</h2>
                <p className="text-sm text-zinc-500">{description}</p>
            </div>

            {rows.length === 0 ? (
                <TableEmptyState label={emptyLabel} />
            ) : (
                <div className="overflow-x-auto">
                    <table className="min-w-full">
                        <thead className="bg-zinc-50 text-left text-xs font-semibold uppercase tracking-wide text-zinc-500">
                            <tr>
                                <th className="px-6 py-3">Content</th>
                                <th className="px-6 py-3">Signal</th>
                                <th className="px-6 py-3 text-right">Readers</th>
                                <th className="px-6 py-3 text-right">Detail</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-zinc-200">
                            {rows.map((row) => (
                                <tr key={row.id}>
                                    <td className="px-6 py-4">
                                        <div className="font-medium text-zinc-900">{row.title}</div>
                                        <div className="text-sm text-zinc-500">
                                            {row.author || "Unknown author"} • {row.type}
                                        </div>
                                    </td>
                                    <td className="px-6 py-4 text-sm font-medium text-zinc-900">
                                        {getDecisionSignal(row, kind)}
                                    </td>
                                    <td className="px-6 py-4 text-right text-sm text-zinc-600">
                                        {row.readerCount.toLocaleString()}
                                    </td>
                                    <td className="px-6 py-4 text-right text-sm text-zinc-600">
                                        {getDecisionDetail(row, kind)}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
        </section>
    );
}

export default async function AdminInsightsPage({
    searchParams,
}: {
    searchParams: Promise<{ range?: string }>;
}) {
    const params = await searchParams;
    const range = params.range === "30d" ? "30d" : "7d";
    const insights = await getAdminInsights(range);
    const posthogAnalyticsUrl = getPostHogAnalyticsUrl();
    const contentMetrics = insights.contentMetrics;
    const compactMetrics = [
        {
            label: "Completion Rate",
            value: formatPercent(contentMetrics.completionRate.value),
            detail: `${contentMetrics.completionRate.numerator.toLocaleString()} of ${contentMetrics.completionRate.denominator.toLocaleString()} signed-in reads`,
            icon: Percent,
        },
        {
            label: "Feedback Rate",
            value: formatPercent(contentMetrics.feedbackRate.value),
            detail: `${contentMetrics.feedbackRate.numerator.toLocaleString()} feedback signals per ${contentMetrics.feedbackRate.denominator.toLocaleString()} reader-days`,
            icon: MessageSquareText,
        },
        {
            label: "Highlights / Reader",
            value: formatRate(contentMetrics.highlightsPerReader.value),
            detail: `${contentMetrics.highlightsPerReader.numerator.toLocaleString()} highlights across ${contentMetrics.highlightsPerReader.denominator.toLocaleString()} reader-days`,
            icon: Highlighter,
        },
        {
            label: "Avg Time / Reader",
            value: formatDuration(contentMetrics.averageReadingTimePerReader.value),
            detail: "Captured reading time divided by reader-days",
            icon: Timer,
        },
    ];

    return (
        <div className="space-y-8">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                <div>
                    <h1 className="text-2xl font-bold text-zinc-900">Content Insights</h1>
                    <p className="mt-1 text-zinc-500">
                        Editorial performance for published content: reader activity, saves, highlights, and feedback. Use PostHog for product analytics, funnels, retention, and acquisition.
                    </p>
                </div>

                <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                    {posthogAnalyticsUrl ? (
                        <Link
                            href={posthogAnalyticsUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center justify-center gap-2 rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm font-medium text-zinc-700 shadow-sm transition-colors hover:bg-zinc-50 hover:text-zinc-950"
                        >
                            Open Product Analytics
                            <ExternalLink className="h-4 w-4" />
                        </Link>
                    ) : null}

                    <div className="inline-flex items-center gap-2 rounded-xl border border-zinc-200 bg-white p-1 shadow-sm">
                        {RANGE_OPTIONS.map((option) => {
                            const isActive = option.value === insights.range;
                            return (
                                <Link
                                    key={option.value}
                                    href={`/admin/insights?range=${option.value}`}
                                    className={`rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                                        isActive
                                            ? "bg-zinc-900 text-white"
                                            : "text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900"
                                    }`}
                                >
                                    {option.label}
                                </Link>
                            );
                        })}
                    </div>
                </div>
            </div>

            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                {insights.cards.map((card, index) => {
                    const Icon = cardIcons[index];
                    const trend = card.trend;
                    return (
                        <div
                            key={card.title}
                            className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm"
                        >
                            <div className="flex items-start justify-between gap-4">
                                <div>
                                    <p className="text-sm font-medium text-zinc-500">{card.title}</p>
                                    <p className="mt-2 text-3xl font-semibold tracking-tight text-zinc-950">
                                        {card.value}
                                    </p>
                                    <p className="mt-2 text-sm text-zinc-500">{card.detail}</p>
                                </div>
                                <div className="rounded-xl bg-zinc-100 p-3 text-zinc-700">
                                    <Icon className="h-5 w-5" />
                                </div>
                            </div>
                            <div className="mt-5 flex flex-wrap items-center gap-2">
                                {trend ? (
                                    <div
                                        title={trend.label}
                                        className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium ${getTrendTone(trend.direction)}`}
                                    >
                                        <TrendIcon direction={trend.direction} />
                                        <span>{formatTrendValue(card)}</span>
                                    </div>
                                ) : null}
                            </div>
                        </div>
                    );
                })}
            </div>

            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                {compactMetrics.map((metric) => {
                    const Icon = metric.icon;

                    return (
                        <div
                            key={metric.label}
                            className="rounded-xl border border-zinc-200 bg-white px-5 py-4 shadow-sm"
                        >
                            <div className="flex items-start justify-between gap-4">
                                <div>
                                    <p className="text-sm font-medium text-zinc-500">{metric.label}</p>
                                    <p className="mt-1 text-2xl font-semibold tracking-tight text-zinc-950">
                                        {metric.value}
                                    </p>
                                    <p className="mt-1 text-xs leading-5 text-zinc-500">{metric.detail}</p>
                                </div>
                                <div className="rounded-lg bg-zinc-100 p-2.5 text-zinc-700">
                                    <Icon className="h-4 w-4" />
                                </div>
                            </div>
                        </div>
                    );
                })}
            </div>

            <div className="grid gap-6 xl:grid-cols-2">
                <DecisionTable
                    title="Most Engaging Content"
                    description="Blended score: readers + time per 5 min + saves x3 + highlights x2 + feedback x2."
                    emptyLabel="engagement"
                    rows={insights.decisionTables.mostEngagingContent}
                    kind="engaging"
                />
                <DecisionTable
                    title="High Traffic, Low Completion"
                    description="Reader-heavy content where signed-in completion is lagging."
                    emptyLabel="low completion"
                    rows={insights.decisionTables.highTrafficLowCompletion}
                    kind="completion"
                />
                <DecisionTable
                    title="High Saves"
                    description="Content with the strongest save behavior in the selected range."
                    emptyLabel="saves"
                    rows={insights.decisionTables.highSaves}
                    kind="saves"
                />
                <DecisionTable
                    title="Needs Attention"
                    description="Content with negative feedback, weak completion, or traffic without deeper actions."
                    emptyLabel="attention"
                    rows={insights.decisionTables.needsAttention}
                    kind="attention"
                />
                <div className="xl:col-span-2">
                    <DecisionTable
                        title="Recently Published Performance"
                        description="New verified content in the selected range with early reader and engagement signals."
                        emptyLabel="recently published"
                        rows={insights.decisionTables.recentlyPublishedPerformance}
                        kind="recent"
                    />
                </div>
            </div>

            <div className="grid gap-6 xl:grid-cols-2">
                <section className="overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-sm">
                    <div className="flex items-center justify-between border-b border-zinc-200 px-6 py-4">
                        <div>
                            <h2 className="font-semibold text-zinc-900">Top Content by Reading Time</h2>
                            <p className="text-sm text-zinc-500">Sorted by total captured reading time across signed-in and guest readers.</p>
                        </div>
                        <BarChart3 className="h-5 w-5 text-zinc-400" />
                    </div>

                    {insights.topByDuration.length === 0 ? (
                        <TableEmptyState label="reading activity" />
                    ) : (
                        <div className="overflow-x-auto">
                            <table className="min-w-full">
                                <thead className="bg-zinc-50 text-left text-xs font-semibold uppercase tracking-wide text-zinc-500">
                                    <tr>
                                        <th className="px-6 py-3">Content</th>
                                        <th className="px-6 py-3">Readers</th>
                                        <th className="px-6 py-3 text-right">Time</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-zinc-200">
                                    {insights.topByDuration.map((item) => (
                                        <tr key={item.id}>
                                            <td className="px-6 py-4">
                                                <div className="font-medium text-zinc-900">{item.title}</div>
                                                <div className="text-sm text-zinc-500">
                                                    {item.author || "Unknown author"} • {item.type}
                                                </div>
                                            </td>
                                            <td className="px-6 py-4 text-sm text-zinc-600">
                                                {item.readerCount.toLocaleString()}
                                            </td>
                                            <td className="px-6 py-4 text-right text-sm font-medium text-zinc-900">
                                                {formatDuration(item.durationSeconds)}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </section>

                <section className="overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-sm">
                    <div className="border-b border-zinc-200 px-6 py-4">
                        <h2 className="font-semibold text-zinc-900">Top Content by Readers</h2>
                        <p className="text-sm text-zinc-500">Sorted by unique reader-days in the selected range, including guests.</p>
                    </div>

                    {insights.topByReaders.length === 0 ? (
                        <TableEmptyState label="reader activity" />
                    ) : (
                        <div className="overflow-x-auto">
                            <table className="min-w-full">
                                <thead className="bg-zinc-50 text-left text-xs font-semibold uppercase tracking-wide text-zinc-500">
                                    <tr>
                                        <th className="px-6 py-3">Content</th>
                                        <th className="px-6 py-3">Readers</th>
                                        <th className="px-6 py-3 text-right">Time</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-zinc-200">
                                    {insights.topByReaders.map((item) => (
                                        <tr key={item.id}>
                                            <td className="px-6 py-4">
                                                <div className="font-medium text-zinc-900">{item.title}</div>
                                                <div className="text-sm text-zinc-500">
                                                    {item.author || "Unknown author"} • {item.type}
                                                </div>
                                            </td>
                                            <td className="px-6 py-4 text-sm font-medium text-zinc-900">
                                                {item.readerCount.toLocaleString()}
                                            </td>
                                            <td className="px-6 py-4 text-right text-sm text-zinc-600">
                                                {formatDuration(item.durationSeconds)}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </section>
            </div>

            <section className="overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-sm">
                <div className="border-b border-zinc-200 px-6 py-4">
                    <h2 className="font-semibold text-zinc-900">Feedback Summary</h2>
                    <p className="text-sm text-zinc-500">
                        Positive and negative feedback from signed-in users submitted in the selected range.
                    </p>
                </div>

                {insights.feedbackSummary.length === 0 ? (
                    <TableEmptyState label="feedback" />
                ) : (
                    <div className="overflow-x-auto">
                        <table className="min-w-full">
                            <thead className="bg-zinc-50 text-left text-xs font-semibold uppercase tracking-wide text-zinc-500">
                                <tr>
                                    <th className="px-6 py-3">Content</th>
                                    <th className="px-6 py-3 text-right">Positive</th>
                                    <th className="px-6 py-3 text-right">Negative</th>
                                    <th className="px-6 py-3 text-right">Total</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-zinc-200">
                                {insights.feedbackSummary.map((item) => (
                                    <tr key={item.id}>
                                        <td className="px-6 py-4 font-medium text-zinc-900">{item.title}</td>
                                        <td className="px-6 py-4 text-right text-sm text-emerald-600">
                                            {item.positiveCount.toLocaleString()}
                                        </td>
                                        <td className="px-6 py-4 text-right text-sm text-rose-600">
                                            {item.negativeCount.toLocaleString()}
                                        </td>
                                        <td className="px-6 py-4 text-right text-sm font-medium text-zinc-900">
                                            {item.totalCount.toLocaleString()}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </section>
        </div>
    );
}
