import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { ReaderView } from "@/components/reader/ReaderView";
import { buildPublicContentMetadata, getReadPageData } from "@/lib/server/public-content";

interface PageProps {
    params: Promise<{ id: string }>;
}

export const revalidate = 300;

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
    const { id } = await params;
    const content = await getReadPageData(id);
    if (!content) return {};

    return buildPublicContentMetadata(content, "read");
}

export default async function ReadPage({ params }: PageProps) {
    const { id } = await params;
    const content = await getReadPageData(id);

    if (!content) {
        notFound();
    }

    return <ReaderView content={content} />;
}
