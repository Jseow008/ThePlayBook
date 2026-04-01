import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { GenerateNarrationButton } from "@/components/admin/GenerateNarrationButton";

describe("GenerateNarrationButton", () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it("generates narration and reports success", async () => {
        const onGenerated = vi.fn();
        global.fetch = vi.fn().mockResolvedValue({
            ok: true,
            json: async () => ({
                data: {
                    url: "https://example.com/audio/generated.mp3",
                    chunk_count: 2,
                },
            }),
        }) as any;

        render(
            <GenerateNarrationButton
                contentId="11111111-1111-1111-1111-111111111111"
                audioUrl=""
                onGenerated={onGenerated}
            />
        );

        fireEvent.click(screen.getByRole("button", { name: /generate ai narration/i }));

        await waitFor(() => {
            expect(onGenerated).toHaveBeenCalledWith("https://example.com/audio/generated.mp3");
            expect(screen.getByText(/saved to this content item using 2 audio chunks/i)).toBeInTheDocument();
        });

        expect(global.fetch).toHaveBeenCalledWith(
            "/api/admin/content/11111111-1111-1111-1111-111111111111/narration",
            { method: "POST" }
        );
    });

    it("shows regeneration copy when audio already exists", () => {
        render(
            <GenerateNarrationButton
                contentId="11111111-1111-1111-1111-111111111111"
                audioUrl="https://example.com/existing.mp3"
                onGenerated={vi.fn()}
            />
        );

        expect(screen.getByRole("button", { name: /regenerate ai narration/i })).toBeInTheDocument();
        expect(screen.getByText(/will replace the stored audio file/i)).toBeInTheDocument();
    });

    it("surfaces generation failures", async () => {
        global.fetch = vi.fn().mockResolvedValue({
            ok: false,
            json: async () => ({
                error: {
                    message: "Narration can only be generated for verified content.",
                },
            }),
        }) as any;

        render(
            <GenerateNarrationButton
                contentId="11111111-1111-1111-1111-111111111111"
                audioUrl=""
                onGenerated={vi.fn()}
            />
        );

        fireEvent.click(screen.getByRole("button", { name: /generate ai narration/i }));

        const errorMessage = await screen.findByText(/narration can only be generated for verified content/i);
        expect(errorMessage).toHaveClass("text-red-600");
    });

    it("falls back to a safe message when the response is not valid JSON", async () => {
        global.fetch = vi.fn().mockResolvedValue({
            ok: false,
            json: async () => {
                throw new SyntaxError("Unexpected token < in JSON");
            },
        }) as any;

        render(
            <GenerateNarrationButton
                contentId="11111111-1111-1111-1111-111111111111"
                audioUrl=""
                onGenerated={vi.fn()}
            />
        );

        fireEvent.click(screen.getByRole("button", { name: /generate ai narration/i }));

        expect(await screen.findByText((content) => content.includes("AI narration could not be completed right now. Please try again."))).toHaveClass("text-red-600");
    });

    it("falls back to a safe message on network failures", async () => {
        global.fetch = vi.fn().mockRejectedValue(new TypeError("Failed to fetch")) as any;

        render(
            <GenerateNarrationButton
                contentId="11111111-1111-1111-1111-111111111111"
                audioUrl=""
                onGenerated={vi.fn()}
            />
        );

        fireEvent.click(screen.getByRole("button", { name: /generate ai narration/i }));

        expect(await screen.findByText(/could not reach the narration service\. please try again\./i)).toHaveClass("text-red-600");
    });
});
