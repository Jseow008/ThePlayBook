import { describe, expect, it } from "vitest";
import {
    absoluteUrl,
    buildArticleJsonLd,
    buildBreadcrumbJsonLd,
    buildOrganizationJsonLd,
    buildSeriesCollectionJsonLd,
    buildWebsiteJsonLd,
    serializeJsonLd,
    serializeJsonLdGraph,
    SITE_URL,
} from "@/lib/seo";

describe("seo helpers", () => {
    it("builds canonical absolute URLs", () => {
        expect(absoluteUrl("/browse")).toBe(`${SITE_URL}/browse`);
        expect(absoluteUrl("https://example.com/item")).toBe("https://example.com/item");
    });

    it("builds sitewide Organization and WebSite JSON-LD", () => {
        expect(buildOrganizationJsonLd()).toMatchObject({
            "@type": "Organization",
            "@id": `${SITE_URL}/#organization`,
            name: "Netflux",
            url: SITE_URL,
        });

        expect(buildWebsiteJsonLd()).toMatchObject({
            "@type": "WebSite",
            "@id": `${SITE_URL}/#website`,
            potentialAction: {
                "@type": "SearchAction",
                target: `${SITE_URL}/search?q={search_term_string}`,
            },
        });
    });

    it("builds Article JSON-LD for read pages", () => {
        expect(buildArticleJsonLd({
            id: "read-1",
            title: "Read Title",
            author: "Reader Author",
            description: "A useful summary.",
            cover_image_url: null,
            created_at: "2026-06-01T00:00:00.000Z",
            updated_at: "2026-06-02T00:00:00.000Z",
        })).toMatchObject({
            "@type": "Article",
            headline: "Read Title",
            url: `${SITE_URL}/read/read-1/read-title`,
            author: {
                "@type": "Person",
                name: "Reader Author",
            },
            datePublished: "2026-06-01T00:00:00.000Z",
            dateModified: "2026-06-02T00:00:00.000Z",
        });
    });

    it("caps series ItemList JSON-LD", () => {
        const jsonLd = buildSeriesCollectionJsonLd(
            { title: "Series", slug: "series", description: null },
            Array.from({ length: 20 }, (_, index) => ({
                id: `item-${index}`,
                title: `Item ${index}`,
            }))
        ) as { mainEntity: { itemListElement: unknown[] } };

        expect(jsonLd.mainEntity.itemListElement).toHaveLength(12);
    });

    it("escapes serialized JSON-LD script content", () => {
        expect(serializeJsonLd(buildBreadcrumbJsonLd([
            { name: "</script>", path: "/" },
        ]))).toContain("\\u003c/script>");
    });

    it("serializes multiple JSON-LD nodes as a schema.org graph", () => {
        const serialized = serializeJsonLdGraph([
            buildOrganizationJsonLd(),
            buildBreadcrumbJsonLd([
                { name: "Home", path: "/" },
                { name: "</script>", path: "/browse" },
            ]),
        ]);
        const jsonLd = JSON.parse(serialized) as {
            "@context": string;
            "@graph": Array<Record<string, unknown>>;
        };

        expect(serialized.trim().startsWith("[")).toBe(false);
        expect(serialized).toContain("\\u003c/script>");
        expect(jsonLd["@context"]).toBe("https://schema.org");
        expect(jsonLd["@graph"]).toHaveLength(2);
        expect(jsonLd["@graph"][0]).toMatchObject({
            "@type": "Organization",
            "@id": `${SITE_URL}/#organization`,
        });
        expect(jsonLd["@graph"][0]).not.toHaveProperty("@context");
        expect(jsonLd["@graph"][1]).toMatchObject({
            "@type": "BreadcrumbList",
            itemListElement: [
                {
                    "@type": "ListItem",
                    position: 1,
                    name: "Home",
                    item: `${SITE_URL}/`,
                },
                {
                    "@type": "ListItem",
                    position: 2,
                    name: "</script>",
                    item: `${SITE_URL}/browse`,
                },
            ],
        });
    });
});
