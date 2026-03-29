import { notFound } from "next/navigation";
import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, Clock3 } from "lucide-react";
import { APP_NAME } from "@/lib/brand";
import { getSeriesPageData } from "@/lib/server/public-content";
import type { ContentItem } from "@/types/database";
import { SeriesSequenceList } from "@/components/ui/SeriesSequenceList";

interface SeriesPageProps {
    params: Promise<{ slug: string }>;
}

export const revalidate = 300;

export async function generateMetadata({ params }: SeriesPageProps): Promise<Metadata> {
    const { slug } = await params;
    const data = await getSeriesPageData(slug);

    if (!data) {
        return {};
    }

    return {
        title: `${data.series.title} — ${APP_NAME}`,
        description: data.series.description ?? `Read the ${data.series.title} series on ${APP_NAME}.`,
    };
}

function formatDuration(durationSeconds: number) {
    const totalMinutes = Math.max(1, Math.round(durationSeconds / 60));

    if (totalMinutes < 60) {
        return `${totalMinutes} min total`;
    }

    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;

    return minutes > 0 ? `${hours}h ${minutes}m total` : `${hours}h total`;
}

function getTotalDurationLabel(items: ContentItem[]) {
    const totalSeconds = items.reduce((sum, item) => sum + (item.duration_seconds ?? 0), 0);
    return totalSeconds > 0 ? formatDuration(totalSeconds) : null;
}

function getFormatSummary(items: ContentItem[]) {
    const uniqueTypes = Array.from(new Set(items.map((item) => item.type)));

    if (uniqueTypes.length === 0) {
        return null;
    }

    if (uniqueTypes.length === 1) {
        const [type] = uniqueTypes;
        return `${type.charAt(0).toUpperCase()}${type.slice(1)} series`;
    }

    return "Mixed formats";
}

function normalizeAuthor(author: string | null | undefined) {
    const trimmed = author?.trim();
    return trimmed ? trimmed : null;
}

function getSeriesAuthor(items: ContentItem[]) {
    const authors = Array.from(
        new Set(
            items
                .map((item) => normalizeAuthor(item.author))
                .filter((author): author is string => Boolean(author))
        )
    );

    if (authors.length === 1) {
        return authors[0];
    }

    return null;
}

export default async function SeriesPage({ params }: SeriesPageProps) {
    const { slug } = await params;
    const data = await getSeriesPageData(slug);

    if (!data) {
        notFound();
    }

    const totalDurationLabel = getTotalDurationLabel(data.items);
    const formatSummary = getFormatSummary(data.items);
    const seriesAuthor = getSeriesAuthor(data.items);
    const firstItem = data.items[0] ?? null;

    return (
        <div className="min-h-screen bg-background pb-8 lg:pb-24">
            <div className="max-w-7xl mx-auto px-6 lg:px-16 py-8 md:py-12">
                <section className="mb-8 mt-2 rounded-[1.75rem] border border-border/60 bg-card/20 px-5 py-6 md:mt-4 sm:px-6 sm:py-7 lg:flex lg:items-end lg:justify-between lg:gap-8">
                    <div className="max-w-3xl space-y-3.5 sm:space-y-4">
                        <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-muted-foreground">
                            Series
                        </p>
                        <div className="space-y-2 sm:space-y-2.5">
                            <h1 className="text-3xl font-bold text-foreground font-display tracking-tight leading-tight sm:text-4xl">
                                {data.series.title}
                            </h1>
                            {seriesAuthor ? (
                                <p className="text-base font-medium leading-snug text-foreground/80 sm:text-lg">
                                    by {seriesAuthor}
                                </p>
                            ) : null}
                            {data.series.description ? (
                                <p className="max-w-2xl pt-0.5 text-base leading-relaxed text-muted-foreground sm:text-lg">
                                    {data.series.description}
                                </p>
                            ) : null}
                        </div>

                        <div className="flex flex-wrap items-center gap-2 pt-0.5">
                            <span className="inline-flex items-center rounded-full border border-border/60 bg-card/30 px-3 py-1.5 text-xs font-medium text-foreground">
                                {data.items.length} part{data.items.length === 1 ? "" : "s"}
                            </span>
                            {totalDurationLabel ? (
                                <span className="inline-flex items-center gap-2 rounded-full border border-border/60 bg-card/30 px-3 py-1.5 text-xs font-medium text-foreground">
                                    <Clock3 className="size-4 text-muted-foreground" />
                                    {totalDurationLabel}
                                </span>
                            ) : null}
                            {formatSummary ? (
                                <span className="inline-flex items-center rounded-full border border-border/60 bg-card/30 px-3 py-1.5 text-xs font-medium text-foreground">
                                    {formatSummary}
                                </span>
                            ) : null}
                        </div>
                    </div>

                    {firstItem ? (
                        <div className="mt-6 shrink-0 lg:mt-0">
                            <Link
                                href={`/read/${firstItem.id}`}
                                className="inline-flex h-12 items-center justify-center gap-2.5 rounded-xl bg-primary px-5 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90"
                            >
                                Start series
                                <ArrowRight className="size-4" />
                            </Link>
                        </div>
                    ) : null}
                </section>

                {data.items.length > 0 ? (
                    <section className="mt-8 sm:mt-10">
                        <div className="mb-4 flex items-center justify-between gap-3">
                            <h2 className="font-display text-2xl font-semibold tracking-tight text-foreground">
                                Parts
                            </h2>
                        </div>
                        <SeriesSequenceList items={data.items} showItemAuthors={!seriesAuthor} />
                    </section>
                ) : (
                    <section className="mt-8 rounded-[1.75rem] border border-border/60 bg-card/30 px-6 py-8 text-center">
                        <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-muted-foreground">
                            Parts
                        </p>
                        <h2 className="mt-3 font-display text-xl font-semibold tracking-tight text-foreground">
                            No published items yet
                        </h2>
                        <p className="mx-auto mt-2 max-w-xl text-sm leading-relaxed text-muted-foreground">
                            This series exists, but there are no verified items available yet.
                        </p>
                    </section>
                )}
            </div>
        </div>
    );
}
