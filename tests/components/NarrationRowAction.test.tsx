import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NarrationRowAction } from "@/components/admin/NarrationRowAction";

describe("NarrationRowAction", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        vi.useRealTimers();
    });

    it("renders a generate action for verified content", () => {
        render(
            <NarrationRowAction
                contentId="11111111-1111-1111-1111-111111111111"
                contentStatus="verified"
                audioUrl=""
                initialStatus="idle"
                initialError={null}
            />
        );

        expect(screen.getByRole("button", { name: /generate ai voice/i })).toBeInTheDocument();
        expect(screen.getByText(/no voice yet/i)).toBeInTheDocument();
    });

    it("shows publish guidance for draft content", () => {
        render(
            <NarrationRowAction
                contentId="11111111-1111-1111-1111-111111111111"
                contentStatus="draft"
                audioUrl=""
                initialStatus="idle"
                initialError={null}
            />
        );

        expect(screen.getByRole("button", { name: /generate ai voice/i })).toBeDisabled();
        expect(screen.getByText(/publish first to enable voice/i)).toBeInTheDocument();
    });

    it("queues and completes narration from the list row", async () => {
        global.fetch = vi.fn()
            .mockResolvedValueOnce({
                ok: true,
                status: 202,
                json: async () => ({
                    data: {
                        job: {
                            status: "queued",
                            error: null,
                            requested_at: "2026-04-05T08:00:00.000Z",
                            started_at: null,
                            completed_at: null,
                            audio_url: "",
                        },
                        message: "AI narration queued. Generation will continue in the background.",
                    },
                }),
            })
            .mockResolvedValueOnce({
                ok: true,
                status: 200,
                json: async () => ({
                    success: true,
                    data: { processed: true },
                }),
            })
            .mockResolvedValueOnce({
                ok: true,
                status: 200,
                json: async () => ({
                    data: {
                        job: {
                            status: "ready",
                            error: null,
                            requested_at: "2026-04-05T08:00:00.000Z",
                            started_at: "2026-04-05T08:00:05.000Z",
                            completed_at: "2026-04-05T08:00:30.000Z",
                            audio_url: "https://example.com/audio/generated.wav",
                        },
                    },
                }),
            }) as any;

        render(
            <NarrationRowAction
                contentId="11111111-1111-1111-1111-111111111111"
                contentStatus="verified"
                audioUrl=""
                initialStatus="idle"
                initialError={null}
            />
        );

        fireEvent.click(screen.getByRole("button", { name: /generate ai voice/i }));

        await waitFor(() => {
            expect(screen.getByText(/voice ready/i)).toBeInTheDocument();
        });

        expect(screen.getByRole("button", { name: /regenerate voice/i })).toBeInTheDocument();
        expect(global.fetch).toHaveBeenNthCalledWith(
            1,
            "/api/admin/content/11111111-1111-1111-1111-111111111111/narration",
            { method: "POST" }
        );
        expect(global.fetch).toHaveBeenNthCalledWith(
            2,
            "/api/admin/narration/process",
            { method: "POST" }
        );
    });
});
