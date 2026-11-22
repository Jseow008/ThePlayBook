import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";
import { ContentCard } from "@/components/ui/ContentCard";
import { createPublicServerClient } from "@/lib/supabase/public-server";
import { fetchShelfItems } from "@/lib/server/browse-shelves";
import { toContentCardData } from "@/lib/server/content-card-data";
import { APP_NAME } from "@/lib/brand";
import type { ContentItem } from "@/types/database";

const PAGE_SIZE = 20;
const boundarySchema = z.object({
    direction: z.enum(["before", "after"]),
    publishedAt: z.iso.datetime({ offset: true }),
    id: z.guid(),
});

export default async function BrowseShelfPage({ params, searchParams }: {
    params: Promise<{ shelf: string }>;
    searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
    const { shelf } = await params;
    const query = await searchParams;
    const hasBoundary = ["direction", "publishedAt", "id"].some((key) => query[key] !== undefined);
    const parsed = boundarySchema.safeParse(query);
    if (hasBoundary && !parsed.success) notFound();
    const boundary = parsed.data;

    let section = null;
    if (shelf !== "new") {
        if (!z.guid().safeParse(shelf).success) notFound();
        const result = await createPublicServerClient().from("homepage_section")
            .select("title, filter_type, filter_value").eq("id", shelf).eq("is_active", true).maybeSingle();
        if (result.error) throw result.error;
        if (!result.data) notFound();
        section = result.data;
    }
    const { data, error } = await fetchShelfItems(section, PAGE_SIZE + 1, boundary);
    if (error) throw error;
    const hasMore = data.length > PAGE_SIZE;
    const items = data.slice(0, PAGE_SIZE);
    const backwards = boundary?.direction === "before";
    if (backwards) items.reverse();
    const base = `/browse/shelf/${shelf}`;
    const href = (direction: "before" | "after", item: typeof items[number]) =>
        `${base}?${new URLSearchParams({ direction, publishedAt: item.published_at!, id: item.id })}`;
    return (
        <div className="mx-auto max-w-7xl space-y-6 px-4 py-6 sm:px-6 lg:px-8">
            <Link href="/browse" className="focus-ring text-sm text-muted-foreground">Back to Browse</Link>
            <h1 className="text-3xl font-bold">{section?.title ?? `New on ${APP_NAME}`}</h1>
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
                {items.map((item) => <ContentCard key={item.id} item={toContentCardData(item) as ContentItem} showMoreTitleLines />)}
            </div>
            {items.length === 0 && <p>No summaries on this page. {boundary && <Link href={base} className="underline">Return to the first page</Link>}</p>}
            {items.length > 0 && <nav aria-label="Shelf pages" className="flex justify-between gap-4">
                {(backwards ? hasMore : Boolean(boundary)) && <Link className="touch-target-44 focus-ring" href={href("before", items[0])}>Previous</Link>}
                {(backwards || hasMore) && <Link className="touch-target-44 focus-ring ml-auto" href={href("after", items[items.length - 1])}>Next</Link>}
            </nav>}
        </div>
    );
}
