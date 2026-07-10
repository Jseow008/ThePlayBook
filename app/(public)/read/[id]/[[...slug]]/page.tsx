import { notFound, permanentRedirect } from "next/navigation";
import type { Metadata } from "next";
import { ReaderView } from "@/components/reader/ReaderView";
import { buildPublicContentDescription, buildPublicContentMetadata, getReadPageData } from "@/lib/server/public-content";
import { buildCanonicalReadPath, isCanonicalReadSlug } from "@/lib/content-paths";
import { buildArticleJsonLd, buildBreadcrumbJsonLd, serializeJsonLdGraph } from "@/lib/seo";

interface PageProps {
    params: Promise<{ id: string; slug?: string[] }>;
    searchParams?: Promise<Record<string, string | string[] | undefined>>;
}

export const revalidate = 300;

export async function generateMetadata({ params, searchParams }: PageProps): Promise<Metadata> {
    const [{ id, slug }, resolvedSearchParams] = await Promise.all([
        params,
        searchParams,
    ]);
    const content = await getReadPageData(id);
    if (!content) return {};

    if (!isCanonicalReadSlug(slug, content.title)) {
        permanentRedirect(buildRedirectTarget(buildCanonicalReadPath(content.id, content.title), resolvedSearchParams));
    }

    return buildPublicContentMetadata(content, "read");
}

function buildRedirectTarget(
    canonicalPath: string,
    searchParams?: Record<string, string | string[] | undefined>
) {
    const params = new URLSearchParams();

    Object.entries(searchParams ?? {}).forEach(([key, value]) => {
        if (Array.isArray(value)) {
            value.forEach((entry) => params.append(key, entry));
            return;
        }

        if (value !== undefined) {
            params.set(key, value);
        }
    });

    const queryString = params.toString();
    return queryString ? `${canonicalPath}?${queryString}` : canonicalPath;
}

export default async function ReadPage({ params, searchParams }: PageProps) {
    const [{ id, slug }, resolvedSearchParams] = await Promise.all([
        params,
        searchParams,
    ]);
    const content = await getReadPageData(id);

    if (!content) {
        notFound();
    }

    if (!isCanonicalReadSlug(slug, content.title)) {
        permanentRedirect(buildRedirectTarget(buildCanonicalReadPath(content.id, content.title), resolvedSearchParams));
    }

    const readPath = buildCanonicalReadPath(content.id, content.title);
    const readJsonLd = [
        buildArticleJsonLd({
            id: content.id,
            title: content.title,
            author: content.author,
            description: buildPublicContentDescription(content),
            cover_image_url: content.cover_image_url,
            created_at: content.created_at,
            updated_at: content.updated_at,
        }),
        buildBreadcrumbJsonLd([
            { name: "Home", path: "/" },
            { name: "Browse", path: "/browse" },
            { name: content.title, path: readPath },
        ]),
    ];

    return (
        <>
            <script
                type="application/ld+json"
                dangerouslySetInnerHTML={{ __html: serializeJsonLdGraph(readJsonLd) }}
            />
            <ReaderView content={content} />
        </>
    );
}
