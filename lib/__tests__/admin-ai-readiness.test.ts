import { describe, expect, it } from "vitest";
import { getAdminAiReadinessMap } from "@/lib/server/admin-ai-readiness";

function buildPagedClient(params: {
    segmentRows: Array<{ id: string; item_id: string; markdown_body: string | null }>;
    embeddingRows: Array<{ content_item_id: string; segment_id: string }>;
}) {
    return {
        from(table: string) {
            return {
                select() {
                    if (table === "segment") {
                        return {
                            is() {
                                return {
                                    in() {
                                        return {
                                            async range(from: number, to: number) {
                                                return {
                                                    data: params.segmentRows.slice(from, to + 1),
                                                    error: null,
                                                };
                                            },
                                        };
                                    },
                                };
                            },
                        };
                    }

                    if (table === "segment_embedding_gemini") {
                        return {
                            in() {
                                return {
                                    async range(from: number, to: number) {
                                        return {
                                            data: params.embeddingRows.slice(from, to + 1),
                                            error: null,
                                        };
                                    },
                                };
                            },
                        };
                    }

                    throw new Error(`Unexpected table ${table}`);
                },
            };
        },
    };
}

describe("getAdminAiReadinessMap", () => {
    it("loads segment and embedding rows beyond the default first page", async () => {
        const items = Array.from({ length: 120 }, (_, index) => ({
            id: `item-${index + 1}`,
            status: "verified",
            embedding: "[1,2,3]",
        }));

        const segmentRows = items.flatMap((item, itemIndex) =>
            Array.from({ length: 10 }, (_, segmentIndex) => ({
                id: `segment-${itemIndex + 1}-${segmentIndex + 1}`,
                item_id: item.id,
                markdown_body: `Segment ${segmentIndex + 1}`,
            }))
        );

        const embeddingRows = segmentRows.map((segment) => ({
            content_item_id: segment.item_id,
            segment_id: segment.id,
        }));

        const readinessMap = await getAdminAiReadinessMap(
            buildPagedClient({ segmentRows, embeddingRows }) as any,
            items
        );

        expect(Object.keys(readinessMap)).toHaveLength(items.length);
        expect(readinessMap["item-1"]?.status).toBe("ready");
        expect(readinessMap["item-120"]?.status).toBe("ready");
        expect(readinessMap["item-120"]?.segment_embeddings.embedded_segments).toBe(10);
        expect(readinessMap["item-120"]?.segment_embeddings.missing_segments).toBe(0);
    });
});
