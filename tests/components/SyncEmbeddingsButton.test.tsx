import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { vi } from "vitest";
import { SyncEmbeddingsButton } from "@/components/admin/SyncEmbeddingsButton";

describe("SyncEmbeddingsButton", () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it("shows content embedding readiness summary", async () => {
        global.fetch = vi.fn().mockResolvedValue({
            ok: true,
            json: async () => ({
                summary: {
                    verified_items: 5,
                    content_embedding_ready_items: 3,
                    missing_content_embeddings: 2,
                },
            }),
        }) as any;

        render(<SyncEmbeddingsButton />);

        await waitFor(() => {
            expect(screen.getByText(/5 verified items tracked/i)).toBeInTheDocument();
            expect(screen.getByText(/3 items already have content embeddings/i)).toBeInTheDocument();
            expect(screen.getByText(/2 verified items still need content embeddings/i)).toBeInTheDocument();
        });
    });

    it("runs sync and refreshes the summary", async () => {
        global.fetch = vi
            .fn()
            .mockResolvedValueOnce({
                ok: true,
                json: async () => ({
                    summary: {
                        verified_items: 5,
                        content_embedding_ready_items: 3,
                        missing_content_embeddings: 2,
                    },
                }),
            } as any)
            .mockResolvedValueOnce({
                ok: true,
                json: async () => ({
                    results: {
                        processed: 2,
                        success: 2,
                        failed: 0,
                    },
                }),
            } as any)
            .mockResolvedValueOnce({
                ok: true,
                json: async () => ({
                    summary: {
                        verified_items: 5,
                        content_embedding_ready_items: 5,
                        missing_content_embeddings: 0,
                    },
                }),
            } as any);

        render(<SyncEmbeddingsButton />);

        await waitFor(() => {
            expect(screen.getByText(/2 verified items still need content embeddings/i)).toBeInTheDocument();
        });

        fireEvent.click(screen.getByRole("button", { name: /run content sync/i }));

        await waitFor(() => {
            expect(screen.getByText(/5 items already have content embeddings/i)).toBeInTheDocument();
            expect(screen.getByText(/synced 2 items/i)).toBeInTheDocument();
        });

        expect(global.fetch).toHaveBeenNthCalledWith(1, "/api/admin/embeddings/sync", { method: "GET" });
        expect(global.fetch).toHaveBeenNthCalledWith(2, "/api/admin/embeddings/sync", { method: "POST" });
        expect(global.fetch).toHaveBeenNthCalledWith(3, "/api/admin/embeddings/sync", { method: "GET" });
    });

    it("shows readiness load failures", async () => {
        global.fetch = vi.fn().mockResolvedValue({
            ok: false,
            json: async () => ({
                error: {
                    message: "Failed to load embedding readiness",
                },
            }),
        }) as any;

        render(<SyncEmbeddingsButton />);

        const errorMessage = await screen.findByText(/failed to load embedding readiness/i);
        expect(errorMessage).toHaveClass("text-red-500");
    });
});
