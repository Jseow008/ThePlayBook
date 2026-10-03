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
            expect(screen.getByText(/all content embeddings are up to date/i)).toBeInTheDocument();
        });

        expect(global.fetch).toHaveBeenNthCalledWith(1, "/api/admin/embeddings/sync", { method: "GET" });
        expect(global.fetch).toHaveBeenNthCalledWith(2, "/api/admin/embeddings/sync", { method: "POST" });
        expect(global.fetch).toHaveBeenNthCalledWith(3, "/api/admin/embeddings/sync", { method: "GET" });
    });

    it("shows failed items and remaining work after a partial batch", async () => {
        global.fetch = vi.fn()
            .mockResolvedValueOnce({ ok: true, json: async () => ({ summary: { verified_items: 100, content_embedding_ready_items: 0, missing_content_embeddings: 100 } }) })
            .mockResolvedValueOnce({ ok: true, json: async () => ({ results: { processed: 25, success: 24, failed: 1 } }) })
            .mockResolvedValueOnce({ ok: true, json: async () => ({ summary: { verified_items: 100, content_embedding_ready_items: 24, missing_content_embeddings: 76 } }) }) as any;

        render(<SyncEmbeddingsButton />);
        await screen.findByText(/100 verified items tracked/i);
        fireEvent.click(screen.getByRole("button", { name: /run content sync/i }));

        const message = await screen.findByText(/synced 24 of 25 items; 1 failed. 76 still need content embeddings/i);
        expect(message).toHaveClass("text-amber-600");
    });

    it("prompts for another batch when a successful run leaves items missing", async () => {
        global.fetch = vi.fn()
            .mockResolvedValueOnce({ ok: true, json: async () => ({ summary: { verified_items: 60, content_embedding_ready_items: 0, missing_content_embeddings: 60 } }) })
            .mockResolvedValueOnce({ ok: true, json: async () => ({ results: { processed: 25, success: 25, failed: 0 } }) })
            .mockResolvedValueOnce({ ok: true, json: async () => ({ summary: { verified_items: 60, content_embedding_ready_items: 25, missing_content_embeddings: 35 } }) }) as any;

        render(<SyncEmbeddingsButton />);
        await screen.findByText(/60 verified items tracked/i);
        fireEvent.click(screen.getByRole("button", { name: /run content sync/i }));

        expect(await screen.findByText(/synced 25 items. 35 still need content embeddings; run another batch/i)).toBeInTheDocument();
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
