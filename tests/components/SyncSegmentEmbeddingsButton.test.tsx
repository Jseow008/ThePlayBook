import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { vi } from "vitest";
import { SyncSegmentEmbeddingsButton } from "@/components/admin/SyncSegmentEmbeddingsButton";

describe("SyncSegmentEmbeddingsButton", () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it("shows coverage summary and a success message with remaining-work hint", async () => {
        global.fetch = vi.fn().mockResolvedValue({
            ok: true,
            json: async () => ({
                summary: {
                    total_library_content_items: 53,
                    embedded_content_items: 40,
                    missing_segments: 12,
                },
                results: {
                    processed: 50,
                    success: 48,
                    failed: 2,
                    has_more_to_process: true,
                },
            }),
        }) as any;

        render(<SyncSegmentEmbeddingsButton />);

        await waitFor(() => {
            expect(screen.getByText(/53 library items referenced/i)).toBeInTheDocument();
            expect(screen.getByText(/40 content items have gemini segment embeddings/i)).toBeInTheDocument();
            expect(screen.getByText(/12 verified segments still need gemini embeddings/i)).toBeInTheDocument();
        });

        fireEvent.click(screen.getByRole("button", { name: /sync ai segments/i }));

        await waitFor(() => {
            expect(screen.getByText(/processed 50 segments/i)).toBeInTheDocument();
            expect(screen.getByText(/more segments remain to be processed/i)).toBeInTheDocument();
        });
    });

    it("surfaces server errors with error styling", async () => {
        global.fetch = vi
            .fn()
            .mockResolvedValueOnce({
                ok: true,
                json: async () => ({
                    summary: {
                        total_library_content_items: 53,
                        embedded_content_items: 40,
                        missing_segments: 12,
                    },
                }),
            } as any)
            .mockResolvedValueOnce({
                ok: false,
                json: async () => ({
                    error: {
                        message: "GEMINI_API_KEY is not configured",
                    },
                }),
            } as any);

        render(<SyncSegmentEmbeddingsButton />);

        await waitFor(() => {
            expect(screen.getByText(/53 library items referenced/i)).toBeInTheDocument();
        });

        fireEvent.click(screen.getByRole("button", { name: /sync ai segments/i }));

        const errorMessage = await screen.findByText(/gemini_api_key is not configured/i);
        expect(errorMessage).toHaveClass("text-red-500");
    });
});
