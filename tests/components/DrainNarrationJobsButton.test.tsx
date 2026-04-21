import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { DrainNarrationJobsButton } from "@/components/admin/DrainNarrationJobsButton";

describe("DrainNarrationJobsButton", () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it("shows a success message when queued narration jobs are processed", async () => {
        global.fetch = vi.fn()
            .mockResolvedValueOnce({
                ok: true,
                json: async () => ({
                    data: {
                        summary: {
                            queuedCount: 2,
                            processingCount: 0,
                        },
                        batchSize: 3,
                    },
                }),
            })
            .mockResolvedValueOnce({
                ok: true,
                json: async () => ({
                    data: {
                        processed: true,
                        processedCount: 2,
                        discardedCount: 0,
                        batchSize: 3,
                        queueSummaryBefore: {
                            queuedCount: 2,
                            processingCount: 0,
                        },
                        queueSummaryAfter: {
                            queuedCount: 0,
                            processingCount: 0,
                        },
                    },
                }),
            }) as any;

        render(<DrainNarrationJobsButton />);

        await waitFor(() => {
            expect(screen.getByText(/2 queued for recovery/i)).toBeInTheDocument();
        });

        fireEvent.click(screen.getByRole("button", { name: /run recovery/i }));

        await waitFor(() => {
            expect(screen.getByText(/processed 2 queued narration jobs/i)).toBeInTheDocument();
        });

        expect(global.fetch).toHaveBeenCalledWith("/api/admin/narration/status", {
            method: "GET",
        });
        expect(global.fetch).toHaveBeenCalledWith("/api/admin/narration/process", {
            method: "POST",
        });
    });

    it("shows an idle message when there are no queued narration jobs", async () => {
        global.fetch = vi.fn()
            .mockResolvedValueOnce({
                ok: true,
                json: async () => ({
                    data: {
                        summary: {
                            queuedCount: 0,
                            processingCount: 0,
                        },
                        batchSize: 3,
                    },
                }),
            })
            .mockResolvedValueOnce({
                ok: true,
                json: async () => ({
                    data: {
                        processed: false,
                        processedCount: 0,
                        discardedCount: 0,
                        batchSize: 3,
                        queueSummaryBefore: {
                            queuedCount: 0,
                            processingCount: 0,
                        },
                        queueSummaryAfter: {
                            queuedCount: 0,
                            processingCount: 0,
                        },
                    },
                }),
            }) as any;

        render(<DrainNarrationJobsButton />);

        await waitFor(() => {
            expect(screen.getByText(/0 queued for recovery/i)).toBeInTheDocument();
        });

        fireEvent.click(screen.getByRole("button", { name: /run recovery/i }));

        await waitFor(() => {
            expect(screen.getByText(/no queued narration jobs found/i)).toBeInTheDocument();
        });
    });

    it("surfaces recovery errors", async () => {
        global.fetch = vi.fn()
            .mockResolvedValueOnce({
                ok: true,
                json: async () => ({
                    data: {
                        summary: {
                            queuedCount: 1,
                            processingCount: 0,
                        },
                        batchSize: 3,
                    },
                }),
            })
            .mockResolvedValueOnce({
                ok: false,
                json: async () => ({
                    error: {
                        message: "Failed to process queued AI narration",
                    },
                }),
            }) as any;

        render(<DrainNarrationJobsButton />);

        await waitFor(() => {
            expect(screen.getByText(/1 queued for recovery/i)).toBeInTheDocument();
        });

        fireEvent.click(screen.getByRole("button", { name: /run recovery/i }));

        await waitFor(() => {
            expect(screen.getByText(/failed to process queued ai narration/i)).toBeInTheDocument();
        });
    });

    it("shows stale processing titles and resets them", async () => {
        global.fetch = vi.fn()
            .mockResolvedValueOnce({
                ok: true,
                json: async () => ({
                    data: {
                        summary: {
                            queuedCount: 0,
                            processingCount: 1,
                        },
                        processingJobs: [
                            {
                                id: "11111111-1111-1111-1111-111111111111",
                                title: "The Singapore Story",
                                author: "Lee Kuan Yew",
                                requestedAt: "2026-04-10T10:18:24.891Z",
                                startedAt: "2026-04-10T10:18:25.116Z",
                                ageMs: 172800000,
                                isStale: true,
                            },
                        ],
                        staleProcessingJobs: [
                            {
                                id: "11111111-1111-1111-1111-111111111111",
                                title: "The Singapore Story",
                                author: "Lee Kuan Yew",
                                requestedAt: "2026-04-10T10:18:24.891Z",
                                startedAt: "2026-04-10T10:18:25.116Z",
                                ageMs: 172800000,
                                isStale: true,
                            },
                        ],
                        batchSize: 3,
                    },
                }),
            })
            .mockResolvedValueOnce({
                ok: true,
                json: async () => ({
                    data: {
                        resetCount: 1,
                        jobs: [
                            {
                                id: "11111111-1111-1111-1111-111111111111",
                                title: "The Singapore Story",
                                author: "Lee Kuan Yew",
                                requestedAt: "2026-04-10T10:18:24.891Z",
                                startedAt: "2026-04-10T10:18:25.116Z",
                                ageMs: 172800000,
                                isStale: true,
                            },
                        ],
                    },
                }),
            })
            .mockResolvedValueOnce({
                ok: true,
                json: async () => ({
                    data: {
                        summary: {
                            queuedCount: 0,
                            processingCount: 0,
                        },
                        processingJobs: [],
                        staleProcessingJobs: [],
                        batchSize: 3,
                    },
                }),
            }) as any;

        render(<DrainNarrationJobsButton />);

        await waitFor(() => {
            expect(screen.getByText(/the singapore story by lee kuan yew/i)).toBeInTheDocument();
        });

        fireEvent.click(screen.getByRole("button", { name: /reset stale processing/i }));

        await waitFor(() => {
            expect(screen.getByText(/reset 1 stale narration job/i)).toBeInTheDocument();
        });

        expect(global.fetch).toHaveBeenNthCalledWith(2, "/api/admin/narration/reset", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
            },
            body: JSON.stringify({
                jobIds: ["11111111-1111-1111-1111-111111111111"],
            }),
        });
    });
});
