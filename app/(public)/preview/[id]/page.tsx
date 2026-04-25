import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { ContentPreview } from "@/components/ui/ContentPreview";
import { buildPublicContentMetadata, getPreviewPageData } from "@/lib/server/public-content";

export const revalidate = 300;

interface PageProps {
    params: Promise<{ id: string }>;
    searchParams?: Promise<{
        takeaways?: string | string[];
    }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
    const { id } = await params;
    const preview = await getPreviewPageData(id);
    if (!preview) return {};

    return buildPublicContentMetadata(preview.item, "preview");
}


function hasTakeawaysAllParam(searchParams?: { takeaways?: string | string[] }) {
    const value = searchParams?.takeaways;
    return Array.isArray(value) ? value.includes("all") : value === "all";
}

export default async function PreviewPage({ params, searchParams }: PageProps) {
    const { id } = await params;
    const resolvedSearchParams = await searchParams;
    const preview = await getPreviewPageData(id);

    if (!preview) {
        notFound();
    }

    return (
        <ContentPreview
            item={preview.item}
            segmentCount={preview.segmentCount}
            seriesContext={preview.seriesContext}
            initialShowAllTakeaways={hasTakeawaysAllParam(resolvedSearchParams)}
        />
    );
}
