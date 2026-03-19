import { describe, expect, it, vi } from "vitest";
import {
    GEMINI_SEGMENT_EMBEDDING_DIMENSIONS,
    SegmentEmbeddingSyncError,
    getGeminiSegmentCoverage,
    runGeminiSegmentBackfill,
} from "@/lib/server/gemini-segment-sync";

describe("gemini segment sync helper", () => {
    it("skips already-embedded segments on rerun", async () => {
        const rpc = vi
            .fn()
            .mockResolvedValueOnce({
                data: [
                    {
                        id: "seg-1",
                        content_item_id: "item-1",
                        markdown_body: "First segment",
                    },
                ],
                error: null,
            })
            .mockResolvedValueOnce({
                data: [],
                error: null,
            })
            .mockResolvedValueOnce({
                data: [],
                error: null,
            });
        const upsert = vi.fn().mockResolvedValue({ error: null });
        const supabase = {
            rpc,
            from: vi.fn().mockReturnValue({
                upsert,
            }),
        };
        const embedBatch = vi.fn().mockResolvedValue([
            Array.from({ length: GEMINI_SEGMENT_EMBEDDING_DIMENSIONS }, (_, index) => index / 1000),
        ]);

        const firstRun = await runGeminiSegmentBackfill({
            supabase,
            embedBatch,
        });
        const secondRun = await runGeminiSegmentBackfill({
            supabase,
            embedBatch,
        });

        expect(firstRun.success).toBe(1);
        expect(secondRun.success).toBe(0);
        expect(embedBatch).toHaveBeenCalledTimes(1);
        expect(upsert).toHaveBeenCalledTimes(1);
    });

    it("uses upsert semantics keyed by segment_id", async () => {
        const rpc = vi
            .fn()
            .mockResolvedValueOnce({
                data: [
                    {
                        id: "seg-1",
                        content_item_id: "item-1",
                        markdown_body: "First segment",
                    },
                ],
                error: null,
            })
            .mockResolvedValueOnce({
                data: [],
                error: null,
            });
        const upsert = vi.fn().mockResolvedValue({ error: null });
        const supabase = {
            rpc,
            from: vi.fn().mockReturnValue({
                upsert,
            }),
        };

        await runGeminiSegmentBackfill({
            supabase,
            embedBatch: vi.fn().mockResolvedValue([
                Array.from({ length: GEMINI_SEGMENT_EMBEDDING_DIMENSIONS }, (_, index) => index / 1000),
            ]),
        });

        expect(upsert).toHaveBeenCalledWith(
            [
                expect.objectContaining({
                    segment_id: "seg-1",
                    content_item_id: "item-1",
                }),
            ],
            { onConflict: "segment_id" }
        );
    });

    it("respects maxSegments across multiple batches", async () => {
        const rpc = vi
            .fn()
            .mockResolvedValueOnce({
                data: [
                    { id: "seg-1", content_item_id: "item-1", markdown_body: "One" },
                    { id: "seg-2", content_item_id: "item-1", markdown_body: "Two" },
                ],
                error: null,
            })
            .mockResolvedValueOnce({
                data: [
                    { id: "seg-3", content_item_id: "item-2", markdown_body: "Three" },
                ],
                error: null,
            });
        const supabase = {
            rpc,
            from: vi.fn().mockReturnValue({
                upsert: vi.fn().mockResolvedValue({ error: null }),
            }),
        };
        const embedBatch = vi
            .fn()
            .mockResolvedValueOnce([
                Array.from({ length: GEMINI_SEGMENT_EMBEDDING_DIMENSIONS }, (_, index) => index / 1000),
                Array.from({ length: GEMINI_SEGMENT_EMBEDDING_DIMENSIONS }, (_, index) => (index + 1) / 1000),
            ]);

        const result = await runGeminiSegmentBackfill({
            supabase,
            embedBatch,
            batchSize: 2,
            maxSegments: 2,
        });

        expect(result.success).toBe(2);
        expect(embedBatch).toHaveBeenCalledTimes(1);
    });

    it("rejects invalid embedding dimensionality", async () => {
        const supabase = {
            rpc: vi
                .fn()
                .mockResolvedValueOnce({
                    data: [
                        { id: "seg-1", content_item_id: "item-1", markdown_body: "One" },
                    ],
                    error: null,
                }),
            from: vi.fn().mockReturnValue({
                upsert: vi.fn(),
            }),
        };

        await expect(runGeminiSegmentBackfill({
            supabase,
            embedBatch: vi.fn().mockResolvedValue([[1, 2, 3]]),
        })).rejects.toBeInstanceOf(SegmentEmbeddingSyncError);
    });

    it("returns normalized coverage summary", async () => {
        const summary = await getGeminiSegmentCoverage({
            rpc: vi.fn().mockResolvedValue({
                data: [{
                    total_library_content_items: "53",
                    embedded_content_items: "40",
                    missing_segments: "12",
                    estimated_remaining_characters: "4200",
                }],
                error: null,
            }),
        });

        expect(summary).toEqual({
            total_library_content_items: 53,
            embedded_content_items: 40,
            missing_segments: 12,
            estimated_remaining_characters: 4200,
        });
    });
});
