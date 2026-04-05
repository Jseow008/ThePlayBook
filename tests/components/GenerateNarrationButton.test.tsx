import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { GenerateNarrationButton } from "@/components/admin/GenerateNarrationButton";

describe("GenerateNarrationButton", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        vi.useRealTimers();
    });

    it("queues narration and polls until ready", async () => {
        const onGenerated = vi.fn();
        const onStatusChange = vi.fn();

        global.fetch = vi.fn()
            .mockResolvedValueOnce({
                ok: true,
                json: async () => ({
                    data: {
                        job: {
                            status: "queued",
                            error: null,
                            requested_at: "2026-04-01T12:00:00.000Z",
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
                json: async () => ({
                    data: {
                        job: {
                            status: "processing",
                            error: null,
                            requested_at: "2026-04-01T12:00:00.000Z",
                            started_at: "2026-04-01T12:00:05.000Z",
                            completed_at: null,
                            audio_url: "",
                        },
                    },
                }),
            })
            .mockResolvedValueOnce({
                ok: true,
                json: async () => ({
                    data: {
                        job: {
                            status: "ready",
                            error: null,
                            requested_at: "2026-04-01T12:00:00.000Z",
                            started_at: "2026-04-01T12:00:05.000Z",
                            completed_at: "2026-04-01T12:00:30.000Z",
                            audio_url: "https://example.com/audio/generated.wav",
                        },
                    },
                }),
            }) as any;

        render(
            <GenerateNarrationButton
                contentId="11111111-1111-1111-1111-111111111111"
                audioUrl=""
                initialStatus="idle"
                initialError={null}
                onGenerated={onGenerated}
                onStatusChange={onStatusChange}
            />
        );

        fireEvent.click(screen.getByRole("button", { name: /generate ai narration/i }));

        await waitFor(() => {
            expect(screen.getByText(/generation will continue in the background/i)).toBeInTheDocument();
        });

        await waitFor(() => {
            expect(global.fetch).toHaveBeenNthCalledWith(
                2,
                "/api/admin/content/11111111-1111-1111-1111-111111111111/narration",
                { method: "GET", cache: "no-store" }
            );
        });

        await waitFor(() => {
            expect(onGenerated).toHaveBeenCalledWith("https://example.com/audio/generated.wav");
            expect(onStatusChange).toHaveBeenCalledWith("ready", null);
            expect(screen.getByText(/ai narration is ready and saved to this content item/i)).toBeInTheDocument();
        });

        expect(global.fetch).toHaveBeenNthCalledWith(
            1,
            "/api/admin/content/11111111-1111-1111-1111-111111111111/narration",
            { method: "POST" }
        );
    });

    it("shows regeneration copy when audio already exists", () => {
        render(
            <GenerateNarrationButton
                contentId="11111111-1111-1111-1111-111111111111"
                audioUrl="https://example.com/existing.wav"
                initialStatus="ready"
                initialError={null}
                onGenerated={vi.fn()}
                onStatusChange={vi.fn()}
            />
        );

        expect(screen.getByRole("button", { name: /regenerate ai narration/i })).toBeInTheDocument();
        expect(screen.getByText(/will replace the stored audio file once the new job finishes/i)).toBeInTheDocument();
    });

    it("does not re-trigger queueing when narration is already queued", async () => {
        const onGenerated = vi.fn();
        global.fetch = vi.fn().mockResolvedValue({
            ok: true,
            json: async () => ({
                data: {
                    job: {
                        status: "queued",
                        error: null,
                        requested_at: "2026-04-01T12:00:00.000Z",
                        started_at: null,
                        completed_at: null,
                        audio_url: "",
                    },
                },
            }),
        }) as any;

        render(
            <GenerateNarrationButton
                contentId="11111111-1111-1111-1111-111111111111"
                audioUrl=""
                initialStatus="queued"
                initialError={null}
                onGenerated={onGenerated}
                onStatusChange={vi.fn()}
            />
        );

        await waitFor(() => {
            expect(global.fetch).toHaveBeenCalledWith(
                "/api/admin/content/11111111-1111-1111-1111-111111111111/narration",
                { method: "GET", cache: "no-store" }
            );
        });

        const button = screen.getByRole("button", { name: /queued/i });
        expect(button).toBeDisabled();
        expect(screen.getByText(/generation will continue in the background/i)).toBeInTheDocument();
        expect(global.fetch).toHaveBeenCalledTimes(1);
        expect(onGenerated).not.toHaveBeenCalled();
    });

    it("surfaces queue failures", async () => {
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
                initialStatus="idle"
                initialError={null}
                onGenerated={vi.fn()}
                onStatusChange={vi.fn()}
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
                initialStatus="idle"
                initialError={null}
                onGenerated={vi.fn()}
                onStatusChange={vi.fn()}
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
                initialStatus="idle"
                initialError={null}
                onGenerated={vi.fn()}
                onStatusChange={vi.fn()}
            />
        );

        fireEvent.click(screen.getByRole("button", { name: /generate ai narration/i }));

        expect(await screen.findByText(/could not reach the narration service\. please try again\./i)).toHaveClass("text-red-600");
    });

    it("keeps queued state when status checks are temporarily rate limited", async () => {
        const onStatusChange = vi.fn();

        global.fetch = vi.fn().mockResolvedValue({
            ok: false,
            status: 429,
            headers: new Headers({ "Retry-After": "5" }),
            json: async () => ({
                error: {
                    message: "Too many requests.",
                },
            }),
        }) as any;

        render(
            <GenerateNarrationButton
                contentId="11111111-1111-1111-1111-111111111111"
                audioUrl=""
                initialStatus="queued"
                initialError={null}
                onGenerated={vi.fn()}
                onStatusChange={onStatusChange}
            />
        );

        await waitFor(() => {
            expect(screen.getByText(/temporarily rate limited; retrying shortly/i)).toBeInTheDocument();
        });

        expect(screen.getByRole("button", { name: /queued/i })).toBeDisabled();
        expect(onStatusChange).not.toHaveBeenCalledWith("failed", "Too many requests.");
    });
});
