import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

describe("public content routes", () => {
    beforeEach(() => {
        vi.resetModules();
    });

    it("reuses the preview loader for metadata and page render", async () => {
        const getPreviewPageDataMock = vi.fn().mockResolvedValue({
            item: {
                id: "preview-1",
                type: "book",
                title: "Preview Title",
                source_url: null,
                status: "verified",
                quick_mode_json: {
                    hook: "Hook",
                    big_idea: "Big idea",
                    key_takeaways: ["A"],
                },
                duration_seconds: 600,
                author: "Author Name",
                cover_image_url: "https://example.com/cover.png",
                category: "Business",
                created_at: "2026-03-19T00:00:00.000Z",
            },
            segmentCount: 4,
        });

        vi.doMock("@/lib/server/public-content", () => ({
            buildPublicContentMetadata: vi.fn(() => ({ title: "Preview Title — Flux" })),
            getPreviewPageData: getPreviewPageDataMock,
        }));

        vi.doMock("@/components/ui/ContentPreview", () => ({
            ContentPreview: ({ item, segmentCount }: { item: { title: string }; segmentCount: number }) => (
                <div>
                    <span>{item.title}</span>
                    <span>{segmentCount} sections</span>
                </div>
            ),
        }));

        const previewModule = await import("@/app/(public)/preview/[id]/page");

        const metadata = await previewModule.generateMetadata({
            params: Promise.resolve({ id: "preview-1" }),
        });

        render(await previewModule.default({
            params: Promise.resolve({ id: "preview-1" }),
        }));

        expect(metadata.title).toBe("Preview Title — Flux");
        expect(screen.getByText("Preview Title")).toBeInTheDocument();
        expect(screen.getByText("4 sections")).toBeInTheDocument();
        expect(getPreviewPageDataMock).toHaveBeenCalledTimes(2);
        expect(getPreviewPageDataMock).toHaveBeenNthCalledWith(1, "preview-1");
        expect(getPreviewPageDataMock).toHaveBeenNthCalledWith(2, "preview-1");
    });

    it("reuses the read loader for metadata and page render", async () => {
        const getReadPageDataMock = vi.fn().mockResolvedValue({
                id: "read-1",
                type: "book",
                title: "Read Title",
                source_url: null,
                status: "verified",
                quick_mode_json: {
                    hook: "Hook",
                    big_idea: "Big idea",
                    key_takeaways: ["A"],
                },
                duration_seconds: 900,
                author: "Reader Author",
                cover_image_url: "https://example.com/read.png",
                category: "Mindset",
                audio_url: null,
                segments: [
                    {
                        id: "segment-1",
                        item_id: "read-1",
                        order_index: 0,
                        title: "Intro",
                        markdown_body: "Hello",
                        start_time_sec: null,
                        end_time_sec: null,
                        deleted_at: null,
                    },
                ],
                artifacts: [],
        });

        vi.doMock("@/lib/server/public-content", () => ({
            buildPublicContentMetadata: vi.fn(() => ({ title: "Read Title — Flux" })),
            getReadPageData: getReadPageDataMock,
        }));

        vi.doMock("@/components/reader/ReaderView", () => ({
            ReaderView: ({ content }: { content: { title: string; segments: Array<{ id: string }> } }) => (
                <div>
                    <span>{content.title}</span>
                    <span>{content.segments.length} segments</span>
                </div>
            ),
        }));

        const readModule = await import("@/app/(public)/read/[id]/page");

        const metadata = await readModule.generateMetadata({
            params: Promise.resolve({ id: "read-1" }),
        });

        render(await readModule.default({
            params: Promise.resolve({ id: "read-1" }),
        }));

        expect(metadata.title).toBe("Read Title — Flux");
        expect(screen.getByText("Read Title")).toBeInTheDocument();
        expect(screen.getByText("1 segments")).toBeInTheDocument();
        expect(getReadPageDataMock).toHaveBeenCalledTimes(2);
        expect(getReadPageDataMock).toHaveBeenNthCalledWith(1, "read-1");
        expect(getReadPageDataMock).toHaveBeenNthCalledWith(2, "read-1");
    });

    it("renders the series page with ordered items", async () => {
        const getSeriesPageDataMock = vi.fn().mockResolvedValue({
            series: {
                id: "series-1",
                slug: "matthew",
                title: "Matthew",
                description: "Matthew series description",
            },
            items: [
                {
                    id: "item-1",
                    title: "Matthew 1-4",
                    type: "book",
                    duration_seconds: 240,
                    author: "Matthew Henry",
                },
                {
                    id: "item-2",
                    title: "Matthew 5-7",
                    type: "book",
                    duration_seconds: 300,
                    author: "Matthew Henry",
                },
            ],
        });

        vi.doMock("@/lib/server/public-content", () => ({
            getSeriesPageData: getSeriesPageDataMock,
        }));

        const seriesModule = await import("@/app/(public)/series/[slug]/page");

        const metadata = await seriesModule.generateMetadata({
            params: Promise.resolve({ slug: "matthew" }),
        });

        render(await seriesModule.default({
            params: Promise.resolve({ slug: "matthew" }),
        }));

        expect(metadata.title).toBe("Matthew — Flux");
        expect(screen.getByText("Matthew")).toBeInTheDocument();
        expect(screen.getByText("by Matthew Henry")).toBeInTheDocument();
        expect(screen.getByText("Matthew series description")).toBeInTheDocument();
        expect(screen.getByRole("link", { name: "Start series" })).toHaveAttribute("href", "/read/item-1");
        expect(screen.getByText("Parts")).toBeInTheDocument();
        expect(screen.getByText("Matthew 1-4")).toBeInTheDocument();
        expect(screen.getByText("Matthew 5-7")).toBeInTheDocument();
        expect(screen.queryByText(/^Matthew Henry$/)).not.toBeInTheDocument();
        expect(screen.queryByRole("link", { name: "Preview Matthew 1-4" })).not.toBeInTheDocument();
        fireEvent.click(screen.getByRole("button", { name: /Matthew 1-4/i }));
        expect(screen.getByRole("link", { name: "Read Matthew 1-4" })).toHaveAttribute("href", "/read/item-1");
        expect(screen.getByRole("link", { name: "Preview Matthew 1-4" })).toHaveAttribute("href", "/preview/item-1");
        expect(screen.queryByRole("link", { name: /Browse all content/i })).not.toBeInTheDocument();
        expect(screen.queryByText("Each part opens on its preview page first")).not.toBeInTheDocument();
        expect(screen.queryByRole("link", { name: /Open preview/i })).not.toBeInTheDocument();
        expect(getSeriesPageDataMock).toHaveBeenCalledTimes(2);
        expect(getSeriesPageDataMock).toHaveBeenNthCalledWith(1, "matthew");
        expect(getSeriesPageDataMock).toHaveBeenNthCalledWith(2, "matthew");
    });
});
