import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { vi } from "vitest";
import { SyncSegmentEmbeddingsButton } from "@/components/admin/SyncSegmentEmbeddingsButton";

describe("SyncSegmentEmbeddingsButton", () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it("shows coverage summary and local CLI instructions", async () => {
        global.fetch = vi.fn().mockResolvedValue({
            ok: true,
            json: async () => ({
                summary: {
                    total_library_content_items: 53,
                    embedded_content_items: 40,
                    missing_segments: 12,
                    estimated_remaining_characters: 4200,
                },
                command: "npm run embeddings:sync-segments",
                dry_run_command: "npm run embeddings:sync-segments -- --dry-run",
            }),
        }) as any;

        render(<SyncSegmentEmbeddingsButton />);

        await waitFor(() => {
            expect(screen.getByText(/53 library items referenced/i)).toBeInTheDocument();
            expect(screen.getByText(/40 content items have gemini segment embeddings/i)).toBeInTheDocument();
            expect(screen.getByText(/12 verified segments still need gemini embeddings/i)).toBeInTheDocument();
            expect(screen.getByText(/4,200 characters remaining to embed/i)).toBeInTheDocument();
        });

        expect(screen.getByText(/segment syncing now runs locally/i)).toBeInTheDocument();
        expect(screen.getByText("npm run embeddings:sync-segments")).toBeInTheDocument();
        expect(screen.getByText("npm run embeddings:sync-segments -- --dry-run")).toBeInTheDocument();
    });

    it("refreshes coverage without posting a sync job", async () => {
        global.fetch = vi
            .fn()
            .mockResolvedValueOnce({
                ok: true,
                json: async () => ({
                    summary: {
                        total_library_content_items: 53,
                        embedded_content_items: 40,
                        missing_segments: 12,
                        estimated_remaining_characters: 4200,
                    },
                    command: "npm run embeddings:sync-segments",
                    dry_run_command: "npm run embeddings:sync-segments -- --dry-run",
                }),
            } as any)
            .mockResolvedValueOnce({
                ok: true,
                json: async () => ({
                    summary: {
                        total_library_content_items: 53,
                        embedded_content_items: 45,
                        missing_segments: 7,
                        estimated_remaining_characters: 2100,
                    },
                    command: "npm run embeddings:sync-segments",
                    dry_run_command: "npm run embeddings:sync-segments -- --dry-run",
                }),
            } as any);

        render(<SyncSegmentEmbeddingsButton />);

        await waitFor(() => {
            expect(screen.getByText(/12 verified segments still need gemini embeddings/i)).toBeInTheDocument();
        });

        fireEvent.click(screen.getByRole("button", { name: /refresh/i }));

        await waitFor(() => {
            expect(screen.getByText(/7 verified segments still need gemini embeddings/i)).toBeInTheDocument();
            expect(screen.getByText(/coverage refreshed/i)).toBeInTheDocument();
        });

        expect(global.fetch).toHaveBeenCalledTimes(2);
        expect(global.fetch).toHaveBeenNthCalledWith(1, "/api/admin/embeddings/sync-segments", { method: "GET" });
        expect(global.fetch).toHaveBeenNthCalledWith(2, "/api/admin/embeddings/sync-segments", { method: "GET" });
    });

    it("surfaces coverage load errors with error styling", async () => {
        global.fetch = vi.fn().mockResolvedValue({
            ok: false,
            json: async () => ({
                error: {
                    message: "Failed to load embedding coverage",
                },
            }),
        }) as any;

        render(<SyncSegmentEmbeddingsButton />);

        const errorMessage = await screen.findByText(/failed to load embedding coverage/i);
        expect(errorMessage).toHaveClass("text-red-500");
    });
});
