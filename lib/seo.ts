import { APP_NAME, APP_TAGLINE } from "@/lib/brand";
import { buildReadPath } from "@/lib/content-paths";

export const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL ?? "https://www.netflux.blog").replace(/\/$/, "");
export const SITE_DESCRIPTION =
    "Netflux turns books, podcasts, articles, and videos into summaries, highlights, and saved ideas you can search, revisit, and use over time.";
export const ROOT_OG_IMAGE = "/images/og-image.webp";
export const ROOT_OG_IMAGE_ALT = `${APP_NAME} - ${APP_TAGLINE}`;

export type JsonLdValue =
    | string
    | number
    | boolean
    | null
    | JsonLdValue[]
    | JsonLdObject;

export type JsonLdObject = { [key: string]: JsonLdValue };

export function absoluteUrl(pathOrUrl: string) {
    try {
        return new URL(pathOrUrl).toString();
    } catch {
        const path = pathOrUrl.startsWith("/") ? pathOrUrl : `/${pathOrUrl}`;
        return `${SITE_URL}${path}`;
    }
}

export function serializeJsonLd(value: JsonLdValue | JsonLdValue[]) {
    return JSON.stringify(value).replace(/</g, "\\u003c");
}

export function serializeJsonLdGraph(nodes: JsonLdValue[]) {
    return serializeJsonLd({
        "@context": "https://schema.org",
        "@graph": nodes.map(stripTopLevelJsonLdContext),
    });
}

function stripTopLevelJsonLdContext(value: JsonLdValue): JsonLdValue {
    if (value === null || typeof value !== "object" || Array.isArray(value)) {
        return value;
    }

    const node: JsonLdObject = {};

    for (const [key, entry] of Object.entries(value)) {
        if (key !== "@context") {
            node[key] = entry;
        }
    }

    return node;
}

export function buildOrganizationJsonLd(): JsonLdValue {
    return {
        "@context": "https://schema.org",
        "@type": "Organization",
        "@id": `${SITE_URL}/#organization`,
        name: APP_NAME,
        url: SITE_URL,
        logo: absoluteUrl("/icons/netflux-icon-borderless.png"),
    };
}

export function buildWebsiteJsonLd(): JsonLdValue {
    return {
        "@context": "https://schema.org",
        "@type": "WebSite",
        "@id": `${SITE_URL}/#website`,
        name: APP_NAME,
        url: SITE_URL,
        description: SITE_DESCRIPTION,
        publisher: {
            "@id": `${SITE_URL}/#organization`,
        },
        potentialAction: {
            "@type": "SearchAction",
            target: `${SITE_URL}/search?q={search_term_string}`,
            "query-input": "required name=search_term_string",
        },
    };
}

export function buildBreadcrumbJsonLd(items: Array<{ name: string; path: string }>): JsonLdValue {
    return {
        "@context": "https://schema.org",
        "@type": "BreadcrumbList",
        itemListElement: items.map((item, index) => ({
            "@type": "ListItem",
            position: index + 1,
            name: item.name,
            item: absoluteUrl(item.path),
        })),
    };
}

export function buildArticleJsonLd(content: {
    id: string;
    title: string;
    author?: string | null;
    description: string;
    cover_image_url?: string | null;
    created_at?: string | null;
    updated_at?: string | null;
}) {
    const canonicalUrl = absoluteUrl(buildReadPath(content));
    const image = content.cover_image_url ? absoluteUrl(content.cover_image_url) : absoluteUrl(`/api/og/content/${content.id}`);

    const article: Record<string, JsonLdValue> = {
        "@context": "https://schema.org",
        "@type": "Article",
        "@id": `${canonicalUrl}#article`,
        headline: content.title,
        description: content.description,
        image,
        url: canonicalUrl,
        mainEntityOfPage: canonicalUrl,
        author: content.author
            ? {
                "@type": "Person",
                name: content.author,
            }
            : {
                "@type": "Organization",
                "@id": `${SITE_URL}/#organization`,
                name: APP_NAME,
            },
        publisher: {
            "@id": `${SITE_URL}/#organization`,
        },
    };

    if (content.created_at) {
        article.datePublished = content.created_at;
    }

    if (content.updated_at ?? content.created_at) {
        article.dateModified = content.updated_at ?? content.created_at ?? null;
    }

    return article;
}

export function buildSeriesCollectionJsonLd(series: {
    title: string;
    description?: string | null;
    slug: string;
}, items: Array<{ id: string; title: string }>): JsonLdValue {
    const seriesUrl = absoluteUrl(`/series/${series.slug}`);

    return {
        "@context": "https://schema.org",
        "@type": "CollectionPage",
        "@id": `${seriesUrl}#collection`,
        name: series.title,
        description: series.description ?? `Read the ${series.title} series on ${APP_NAME}.`,
        url: seriesUrl,
        isPartOf: {
            "@id": `${SITE_URL}/#website`,
        },
        mainEntity: {
            "@type": "ItemList",
            itemListElement: items.slice(0, 12).map((item, index) => ({
                "@type": "ListItem",
                position: index + 1,
                name: item.title,
                url: absoluteUrl(buildReadPath(item)),
            })),
        },
    };
}
