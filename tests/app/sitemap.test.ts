import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
    createPublicServerClient: vi.fn(),
    getRequestId: vi.fn(() => "sitemap-request-id"),
    logApiError: vi.fn(),
}));

vi.mock("@/lib/supabase/public-server", () => ({
    createPublicServerClient: mocks.createPublicServerClient,
}));

vi.mock("@/lib/server/api", () => ({
    getRequestId: mocks.getRequestId,
    logApiError: mocks.logApiError,
}));

function buildSupabaseMock(params: {
    contentData?: Array<{
        id: string;
        title: string;
        updated_at: string;
        created_at: string;
        series_id: string | null;
    }> | null;
    contentError?: unknown;
    seriesData?: Array<{
        id: string;
        slug: string;
        updated_at: string;
        created_at: string;
    }> | null;
    seriesError?: unknown;
}) {
    const seriesInMock = vi.fn().mockReturnValue({
        order: vi.fn().mockResolvedValue({
            data: params.seriesData ?? [],
            error: params.seriesError ?? null,
        }),
    });
    const fromMock = vi.fn((table: string) => {
        if (table === "content_item") {
            return {
                select: vi.fn().mockReturnValue({
                    eq: vi.fn().mockReturnThis(),
                    is: vi.fn().mockReturnThis(),
                    order: vi.fn().mockResolvedValue({
                        data: params.contentData ?? [],
                        error: params.contentError ?? null,
                    }),
                }),
            };
        }

        if (table === "content_series") {
            return {
                select: vi.fn().mockReturnValue({
                    in: seriesInMock,
                }),
            };
        }

        throw new Error(`Unexpected table ${table}`);
    });

    return { fromMock, seriesInMock };
}

describe("sitemap", () => {
    beforeEach(() => {
        vi.resetModules();
        vi.clearAllMocks();
    });

    it("includes core discovery, linked series, and read pages", async () => {
        const { fromMock, seriesInMock } = buildSupabaseMock({
            contentData: [
                {
                    id: "read-1",
                    title: "Read Title",
                    updated_at: "2026-06-01T00:00:00.000Z",
                    created_at: "2026-06-01T00:00:00.000Z",
                    series_id: "series-1",
                },
            ],
            seriesData: [{
                id: "series-1",
                slug: "matthew",
                updated_at: "2026-06-02T00:00:00.000Z",
                created_at: "2026-06-02T00:00:00.000Z",
            }],
        });
        mocks.createPublicServerClient.mockReturnValue({ from: fromMock });

        const sitemap = (await import("@/app/sitemap")).default;
        const routes = await sitemap();
        const urls = routes.map((route) => route.url);

        expect(urls).toContain("https://www.netflux.blog/browse");
        expect(urls).toContain("https://www.netflux.blog/search");
        expect(urls).toContain("https://www.netflux.blog/series/matthew");
        expect(urls).toContain("https://www.netflux.blog/read/read-1/read-title");
        expect(seriesInMock).toHaveBeenCalledWith("id", ["series-1"]);
    });

    it("does not include unlinked or empty series", async () => {
        const { fromMock, seriesInMock } = buildSupabaseMock({
            contentData: [{
                id: "read-1",
                title: "Read Title",
                updated_at: "2026-06-01T00:00:00.000Z",
                created_at: "2026-06-01T00:00:00.000Z",
                series_id: null,
            }],
        });
        mocks.createPublicServerClient.mockReturnValue({ from: fromMock });

        const sitemap = (await import("@/app/sitemap")).default;
        const routes = await sitemap();
        const urls = routes.map((route) => route.url);

        expect(urls).not.toContain("https://www.netflux.blog/series/matthew");
        expect(seriesInMock).not.toHaveBeenCalled();
        expect(fromMock).not.toHaveBeenCalledWith("content_series");
    });

    it("logs content and series query failures", async () => {
        const contentError = new Error("content query failed");
        const seriesError = new Error("series query failed");
        const { fromMock } = buildSupabaseMock({
            contentData: [{
                id: "read-1",
                title: "Read Title",
                updated_at: "2026-06-01T00:00:00.000Z",
                created_at: "2026-06-01T00:00:00.000Z",
                series_id: "series-1",
            }],
            contentError,
            seriesError,
        });
        mocks.createPublicServerClient.mockReturnValue({ from: fromMock });

        const sitemap = (await import("@/app/sitemap")).default;
        const routes = await sitemap();
        const urls = routes.map((route) => route.url);

        expect(urls).toContain("https://www.netflux.blog/browse");
        expect(mocks.logApiError).toHaveBeenCalledWith({
            requestId: "sitemap-request-id",
            route: "/sitemap.xml",
            message: "Failed to fetch sitemap content items",
            error: contentError,
        });
        expect(mocks.logApiError).toHaveBeenCalledWith({
            requestId: "sitemap-request-id",
            route: "/sitemap.xml",
            message: "Failed to fetch sitemap series",
            error: seriesError,
        });
    });
});
