import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { DrainNarrationJobsButton } from "@/components/admin/DrainNarrationJobsButton";

describe("DrainNarrationJobsButton", () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it("shows a success message when queued narration jobs are processed", async () => {
        global.fetch = vi.fn().mockResolvedValue({
            ok: true,
            json: async () => ({
                data: {
                    processed: true,
                    processedCount: 2,
                    discardedCount: 0,
                },
            }),
        }) as any;

        render(<DrainNarrationJobsButton />);

        fireEvent.click(screen.getByRole("button", { name: /run recovery/i }));

        await waitFor(() => {
            expect(screen.getByText(/processed 2 queued narration jobs/i)).toBeInTheDocument();
        });

        expect(global.fetch).toHaveBeenCalledWith("/api/admin/narration/process", {
            method: "POST",
        });
    });

    it("shows an idle message when there are no queued narration jobs", async () => {
        global.fetch = vi.fn().mockResolvedValue({
            ok: true,
            json: async () => ({
                data: {
                    processed: false,
                    processedCount: 0,
                    discardedCount: 0,
                },
            }),
        }) as any;

        render(<DrainNarrationJobsButton />);

        fireEvent.click(screen.getByRole("button", { name: /run recovery/i }));

        await waitFor(() => {
            expect(screen.getByText(/no queued narration jobs found/i)).toBeInTheDocument();
        });
    });

    it("surfaces recovery errors", async () => {
        global.fetch = vi.fn().mockResolvedValue({
            ok: false,
            json: async () => ({
                error: {
                    message: "Failed to process queued AI narration",
                },
            }),
        }) as any;

        render(<DrainNarrationJobsButton />);

        fireEvent.click(screen.getByRole("button", { name: /run recovery/i }));

        await waitFor(() => {
            expect(screen.getByText(/failed to process queued ai narration/i)).toBeInTheDocument();
        });
    });
});
