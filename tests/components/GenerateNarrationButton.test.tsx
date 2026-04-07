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
                            audio_url: "https://example.com/audio/generated.mp3",
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

        fireEvent.click(screen.getByRole("button", { name: /generate narration/i }));

        await waitFor(() => {
            expect(screen.getByText("Queued Apr 1 at 8:00 PM.")).toBeInTheDocument();
        });

        await waitFor(() => {
            expect(global.fetch).toHaveBeenNthCalledWith(
                2,
                "/api/admin/content/11111111-1111-1111-1111-111111111111/narration",
                { method: "GET", cache: "no-store" }
            );
        });

        await waitFor(() => {
            expect(onGenerated).toHaveBeenCalledWith("https://example.com/audio/generated.mp3");
            expect(onStatusChange).toHaveBeenCalledWith("ready", null);
            expect(screen.getByText("Generated Apr 1 at 8:00 PM.")).toBeInTheDocument();
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
                audioUrl="https://example.com/existing.mp3"
                initialStatus="ready"
                initialError={null}
                onGenerated={vi.fn()}
                onStatusChange={vi.fn()}
            />
        );

        expect(screen.getByRole("button", { name: /regenerate narration/i })).toBeInTheDocument();
        expect(screen.getByText(/^ready$/i)).toBeInTheDocument();
        expect(screen.getByText(/narration is ready\./i)).toBeInTheDocument();
    });

    it("renders ready timestamps with a deterministic format", () => {
        render(
            <GenerateNarrationButton
                contentId="11111111-1111-1111-1111-111111111111"
                audioUrl="https://example.com/existing.mp3"
                initialStatus="ready"
                initialError={null}
                initialCompletedAt="2026-04-07T07:04:00.000Z"
                onGenerated={vi.fn()}
                onStatusChange={vi.fn()}
            />
        );

        expect(screen.getByText("Generated Apr 7 at 3:04 PM.")).toBeInTheDocument();
    });

    it("shows a stale warning when narration is out of date", () => {
        render(
            <GenerateNarrationButton
                contentId="11111111-1111-1111-1111-111111111111"
                audioUrl="https://example.com/existing.mp3"
                initialStatus="stale"
                initialError={null}
                onGenerated={vi.fn()}
                onStatusChange={vi.fn()}
            />
        );

        expect(screen.getByRole("button", { name: /regenerate narration/i })).toBeInTheDocument();
        expect(screen.getAllByText(/out of date/i).length).toBeGreaterThan(0);
        expect(screen.getByText(/current audio no longer matches the latest content\./i)).toHaveClass("text-amber-600");
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
        expect(screen.getByText("Queued Apr 1 at 8:00 PM.")).toBeInTheDocument();
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

        fireEvent.click(screen.getByRole("button", { name: /generate narration/i }));

        const errorMessages = await screen.findAllByText(/narration can only be generated for verified content/i);
        expect(errorMessages.some((element) => element.className.includes("text-red-600"))).toBe(true);
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

        fireEvent.click(screen.getByRole("button", { name: /generate narration/i }));

        const errorMessages = await screen.findAllByText((content) => content.includes("AI narration could not be completed right now. Please try again."));
        expect(errorMessages.some((element) => element.className.includes("text-red-600"))).toBe(true);
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

        fireEvent.click(screen.getByRole("button", { name: /generate narration/i }));

        const errorMessages = await screen.findAllByText(/could not reach the narration service\. please try again\./i);
        expect(errorMessages.some((element) => element.className.includes("text-red-600"))).toBe(true);
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

    it("retries after a temporary status fetch failure instead of marking the job failed", async () => {
        const onGenerated = vi.fn();
        const onStatusChange = vi.fn();

        global.fetch = vi.fn()
            .mockResolvedValueOnce({
                ok: false,
                status: 500,
                json: async () => ({
                    error: {
                        message: "Temporary outage",
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
                            audio_url: "https://example.com/audio/generated-v2.mp3",
                        },
                    },
                }),
            })
            .mockResolvedValue({
                ok: true,
                json: async () => ({
                    data: {
                        job: {
                            status: "ready",
                            error: null,
                            requested_at: "2026-04-01T12:00:00.000Z",
                            started_at: "2026-04-01T12:00:05.000Z",
                            completed_at: "2026-04-01T12:00:30.000Z",
                            audio_url: "https://example.com/audio/generated-v2.mp3",
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
                pollIntervalMs={10}
                onGenerated={onGenerated}
                onStatusChange={onStatusChange}
            />
        );

        await waitFor(() => {
            expect(screen.getByText(/temporarily unavailable; retrying shortly/i)).toBeInTheDocument();
        });

        await waitFor(() => {
            expect(screen.getByText("Generated Apr 1 at 8:00 PM.")).toBeInTheDocument();
        });

        expect(onGenerated).toHaveBeenCalledWith("https://example.com/audio/generated-v2.mp3");
        expect(onStatusChange).not.toHaveBeenCalledWith("failed", expect.any(String));
    });
});
