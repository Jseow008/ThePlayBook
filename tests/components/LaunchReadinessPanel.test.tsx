import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { vi } from "vitest";
import { LaunchReadinessPanel } from "@/components/admin/LaunchReadinessPanel";

describe("LaunchReadinessPanel", () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it("renders degraded launch readiness details from a structured 503 payload", async () => {
        global.fetch = vi.fn().mockResolvedValue({
            ok: false,
            json: async () => ({
                status: "degraded",
                timestamp: "2026-04-01T00:00:00.000Z",
                runtime: {
                    environment: "production",
                    status: "degraded",
                    checks: {
                        supabase_public: "ready",
                        supabase_admin: "ready",
                        site_url: "ready",
                        app_url: "derived",
                        ai_generation: "ready",
                        ai_retrieval: "missing",
                        rate_limiting: "ready",
                        error_reporting: "missing",
                    },
                    issues: [
                        "Ask My Library retrieval requires GEMINI_API_KEY.",
                        "Production exception monitoring requires ERROR_REPORTING_WEBHOOK_URL.",
                    ],
                },
                database: {
                    status: "degraded",
                    ai_readiness: {
                        status: "degraded",
                        summary: {
                            verified_items: 2,
                            ai_ready_items: 1,
                            ai_stale_items: 1,
                            stale_content_embeddings: 1,
                            stale_segment_embeddings: 1,
                            items_without_published_segments: 0,
                        },
                        issues: [
                            "1 verified content item(s) are missing content embeddings.",
                        ],
                    },
                    segment_coverage: {
                        status: "degraded",
                        summary: {
                            total_library_content_items: 2,
                            embedded_content_items: 1,
                            missing_segments: 4,
                            estimated_remaining_characters: 3200,
                        },
                        issues: [
                            "4 Gemini segment embedding(s) are still missing.",
                        ],
                    },
                    storage: {
                        status: "degraded",
                        buckets: {
                            media: { present: true, public: true, status: "ready" },
                            audio: { present: false, public: null, status: "degraded" },
                        },
                        issues: ['Supabase storage bucket "audio" is missing.'],
                    },
                },
                issues: [
                    "Ask My Library retrieval requires GEMINI_API_KEY.",
                    "Production exception monitoring requires ERROR_REPORTING_WEBHOOK_URL.",
                    'Supabase storage bucket "audio" is missing.',
                ],
            }),
        }) as any;

        render(<LaunchReadinessPanel />);

        await waitFor(() => {
            expect(screen.getByText("Launch Readiness")).toBeInTheDocument();
            expect(screen.getByText("Needs attention")).toBeInTheDocument();
            expect(screen.getByText("Env: production")).toBeInTheDocument();
            expect(screen.getByTestId("launch-readiness-ai-ready")).toHaveTextContent("1 / 2");
            expect(screen.getByTestId("launch-readiness-missing-segments")).toHaveTextContent("4");
            expect(screen.getByTestId("launch-readiness-audio-bucket")).toHaveTextContent("degraded");
            expect(screen.getByText(/supabase storage bucket "audio" is missing/i)).toBeInTheDocument();
        });

        expect(screen.getByText("derived")).toBeInTheDocument();
        expect(screen.getAllByText("missing").length).toBeGreaterThan(0);
        expect(global.fetch).toHaveBeenCalledWith("/api/admin/launch-readiness", expect.objectContaining({
            method: "GET",
            cache: "no-store",
        }));
    });

    it("refreshes the panel and updates the readiness summary", async () => {
        global.fetch = vi.fn()
            .mockResolvedValueOnce({
                ok: true,
                json: async () => ({
                    status: "ready",
                    timestamp: "2026-04-01T00:00:00.000Z",
                    runtime: {
                        environment: "production",
                        status: "ready",
                        checks: {
                            supabase_public: "ready",
                            supabase_admin: "ready",
                            site_url: "ready",
                            app_url: "ready",
                            ai_generation: "ready",
                            ai_retrieval: "ready",
                            rate_limiting: "ready",
                            error_reporting: "ready",
                        },
                        issues: [],
                    },
                    database: {
                        status: "ready",
                        ai_readiness: {
                            status: "ready",
                            summary: {
                                verified_items: 3,
                                ai_ready_items: 3,
                                ai_stale_items: 0,
                                stale_content_embeddings: 0,
                                stale_segment_embeddings: 0,
                                items_without_published_segments: 0,
                            },
                            issues: [],
                        },
                        segment_coverage: {
                            status: "ready",
                            summary: {
                                total_library_content_items: 3,
                                embedded_content_items: 3,
                                missing_segments: 0,
                                estimated_remaining_characters: 0,
                            },
                            issues: [],
                        },
                        storage: {
                            status: "ready",
                            buckets: {
                                media: { present: true, public: true, status: "ready" },
                                audio: { present: true, public: true, status: "ready" },
                            },
                            issues: [],
                        },
                    },
                    issues: [],
                }),
            } as any)
            .mockResolvedValueOnce({
                ok: true,
                json: async () => ({
                    status: "ready",
                    timestamp: "2026-04-01T00:05:00.000Z",
                    runtime: {
                        environment: "production",
                        status: "ready",
                        checks: {
                            supabase_public: "ready",
                            supabase_admin: "ready",
                            site_url: "ready",
                            app_url: "ready",
                            ai_generation: "ready",
                            ai_retrieval: "ready",
                            rate_limiting: "ready",
                            error_reporting: "ready",
                        },
                        issues: [],
                    },
                    database: {
                        status: "ready",
                        ai_readiness: {
                            status: "ready",
                            summary: {
                                verified_items: 4,
                                ai_ready_items: 4,
                                ai_stale_items: 0,
                                stale_content_embeddings: 0,
                                stale_segment_embeddings: 0,
                                items_without_published_segments: 0,
                            },
                            issues: [],
                        },
                        segment_coverage: {
                            status: "ready",
                            summary: {
                                total_library_content_items: 4,
                                embedded_content_items: 4,
                                missing_segments: 0,
                                estimated_remaining_characters: 0,
                            },
                            issues: [],
                        },
                        storage: {
                            status: "ready",
                            buckets: {
                                media: { present: true, public: true, status: "ready" },
                                audio: { present: true, public: true, status: "ready" },
                            },
                            issues: [],
                        },
                    },
                    issues: [],
                }),
            } as any);

        render(<LaunchReadinessPanel />);

        await waitFor(() => {
            expect(screen.getByText("Ready")).toBeInTheDocument();
            expect(screen.getByTestId("launch-readiness-ai-ready")).toHaveTextContent("3 / 3");
            expect(screen.getByText("No launch-blocking issues were reported by the admin readiness endpoint.")).toBeInTheDocument();
        });

        fireEvent.click(screen.getByRole("button", { name: /refresh/i }));

        await waitFor(() => {
            expect(screen.getByTestId("launch-readiness-ai-ready")).toHaveTextContent("4 / 4");
            expect(screen.getByText("Launch readiness refreshed.")).toBeInTheDocument();
        });

        expect(global.fetch).toHaveBeenCalledTimes(2);
    });

    it("shows an error state when the endpoint fails without a structured payload", async () => {
        global.fetch = vi.fn().mockResolvedValue({
            ok: false,
            json: async () => ({
                error: {
                    message: "Failed to load launch readiness",
                },
            }),
        }) as any;

        render(<LaunchReadinessPanel />);

        const errorMessage = await screen.findByText(/failed to load launch readiness/i);
        expect(errorMessage).toHaveClass("text-red-500");
    });
});
