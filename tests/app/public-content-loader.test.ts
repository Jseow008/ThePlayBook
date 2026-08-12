import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
    createPublicServerClient: vi.fn(),
}));

vi.mock("@/lib/supabase/public-server", () => ({
    createPublicServerClient: mocks.createPublicServerClient,
}));

describe("public content loaders", () => {
    beforeEach(() => {
        vi.resetModules();
        vi.clearAllMocks();
    });

    it("selects and returns audio availability for preview pages", async () => {
        const audioUrl = "https://example.com/summary.mp3";
        const contentSelectMock = vi.fn();
        const contentQuery = {
            eq: vi.fn().mockReturnThis(),
            is: vi.fn().mockReturnThis(),
            single: vi.fn().mockResolvedValue({
                data: {
                    id: "preview-with-audio",
                    type: "podcast",
                    title: "Preview with audio",
                    source_url: null,
                    status: "verified",
                    quick_mode_json: null,
                    duration_seconds: 600,
                    author: "Example Author",
                    cover_image_url: null,
                    category: "Business",
                    audio_url: audioUrl,
                    created_at: "2026-08-12T00:00:00.000Z",
                    series_id: null,
                    series_order: null,
                },
                error: null,
            }),
        };
        contentSelectMock.mockReturnValue(contentQuery);

        const segmentQuery = {
            eq: vi.fn().mockReturnThis(),
            is: vi.fn().mockResolvedValue({ count: 7, error: null }),
        };
        const segmentSelectMock = vi.fn().mockReturnValue(segmentQuery);
        const fromMock = vi.fn((table: string) => {
            if (table === "content_item") {
                return { select: contentSelectMock };
            }

            if (table === "segment") {
                return { select: segmentSelectMock };
            }

            throw new Error(`Unexpected table ${table}`);
        });

        mocks.createPublicServerClient.mockReturnValue({ from: fromMock });

        const { getPreviewPageData } = await import("@/lib/server/public-content");
        const result = await getPreviewPageData("preview-with-audio");
        const selectedFields = String(contentSelectMock.mock.calls[0]?.[0])
            .split(",")
            .map((field) => field.trim());

        expect(selectedFields).toContain("audio_url");
        expect(result?.item.audio_url).toBe(audioUrl);
        expect(result?.segmentCount).toBe(7);
    });
});
