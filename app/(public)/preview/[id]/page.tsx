import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { ContentPreview } from "@/components/ui/ContentPreview";
import { buildPublicContentMetadata, getPreviewPageData } from "@/lib/server/public-content";

export const revalidate = 300;

interface PageProps {
    params: Promise<{ id: string }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
    const { id } = await params;
    const preview = await getPreviewPageData(id);
    if (!preview) return {};

    return buildPublicContentMetadata(preview.item, "preview");
}


export default async function PreviewPage({ params }: PageProps) {
    const { id } = await params;
    const preview = await getPreviewPageData(id);

    if (!preview) {
        notFound();
    }

    return (
        <ContentPreview
            item={preview.item}
            segmentCount={preview.segmentCount}
            seriesContext={preview.seriesContext}
        />
    );
}
