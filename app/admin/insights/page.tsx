import Link from "next/link";
import { BarChart3, Bookmark, Clock3, Highlighter, Users } from "lucide-react";
import { getAdminInsights, type InsightsRange } from "@/lib/admin/insights";

const RANGE_OPTIONS: Array<{ value: InsightsRange; label: string }> = [
    { value: "7d", label: "Last 7 days" },
    { value: "30d", label: "Last 30 days" },
];

const cardIcons = [Users, Clock3, Bookmark, Highlighter];

function formatDuration(seconds: number): string {
    const minutes = Math.round(seconds / 60);
    if (minutes < 60) return `${minutes} min`;

    const hours = Math.floor(minutes / 60);
    const remainingMinutes = minutes % 60;

    if (remainingMinutes === 0) return `${hours} hr`;
    return `${hours}h ${remainingMinutes}m`;
}

function TableEmptyState({ label }: { label: string }) {
    return (
        <div className="px-6 py-10 text-sm text-zinc-500">
            No {label.toLowerCase()} data yet for this range.
        </div>
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

    return (
        <div className="space-y-8">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                <div>
                    <h1 className="text-2xl font-bold text-zinc-900">Insights</h1>
                    <p className="mt-1 text-zinc-500">
                        Reading and engagement signals for your published content.
                    </p>
                </div>

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

            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                {insights.cards.map((card, index) => {
                    const Icon = cardIcons[index];
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
                        </div>
                    );
                })}
            </div>

            <div className="grid gap-6 xl:grid-cols-2">
                <section className="overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-sm">
                    <div className="flex items-center justify-between border-b border-zinc-200 px-6 py-4">
                        <div>
                            <h2 className="font-semibold text-zinc-900">Top Content by Reading Time</h2>
                            <p className="text-sm text-zinc-500">Sorted by total captured reading time.</p>
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
                        <p className="text-sm text-zinc-500">Sorted by unique reader-days in the selected range.</p>
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
                        Positive and negative feedback submitted in the selected range.
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
