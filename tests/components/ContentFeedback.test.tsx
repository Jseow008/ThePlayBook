import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ContentFeedback } from "@/components/ui/ContentFeedback";

const { toastSuccessMock, toastErrorMock, fetchMock } = vi.hoisted(() => ({
    toastSuccessMock: vi.fn(),
    toastErrorMock: vi.fn(),
    fetchMock: vi.fn(),
}));

vi.mock("@/hooks/useAuthUser", () => ({
    useAuthUser: () => ({ id: "user-1" }),
}));

vi.mock("sonner", () => ({
    toast: {
        success: toastSuccessMock,
        error: toastErrorMock,
    },
}));

describe("ContentFeedback", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        fetchMock.mockReset();
        fetchMock.mockResolvedValue({
            ok: true,
            json: async () => ({ data: { status: null } }),
        });
        vi.stubGlobal("fetch", fetchMock);
    });

    it("rolls back a failed upvote and shows an error toast instead of success", async () => {
        fetchMock
            .mockResolvedValueOnce({
                ok: true,
                json: async () => ({ data: { status: null } }),
            })
            .mockResolvedValueOnce({
                ok: true,
                json: async () => ({ data: { status: null } }),
            })
            .mockResolvedValueOnce({
                ok: false,
                json: async () => ({ error: { message: "Write failed" } }),
            });

        render(<ContentFeedback contentId="123e4567-e89b-12d3-a456-426614174111" />);

        await waitFor(() => {
            expect(fetchMock).toHaveBeenCalled();
        });

        const upvoteButton = screen.getByRole("button", { name: "Thumbs Up" });
        fireEvent.click(upvoteButton);

        await waitFor(() => {
            expect(toastErrorMock).toHaveBeenCalledWith("Could not save feedback right now.");
        });

        expect(toastSuccessMock).not.toHaveBeenCalled();
        expect(upvoteButton).not.toHaveClass("bg-primary/20");
    });

    it("rolls back a failed delete and keeps the existing vote selected", async () => {
        fetchMock.mockImplementation((input: RequestInfo | URL, init?: RequestInit) => {
            const requestUrl = String(input);

            if (requestUrl.startsWith("/api/feedback/content?")) {
                return Promise.resolve({
                    ok: true,
                    json: async () => ({ data: { status: "up" } }),
                });
            }

            if (init?.method === "DELETE") {
                return Promise.resolve({
                    ok: false,
                    json: async () => ({ error: { message: "Delete failed" } }),
                });
            }

            return Promise.resolve({
                ok: true,
                json: async () => ({ data: { status: "up" } }),
            });
        });

        render(<ContentFeedback contentId="123e4567-e89b-12d3-a456-426614174111" />);

        const upvoteButton = await screen.findByRole("button", { name: "Thumbs Up" });
        await waitFor(() => {
            expect(upvoteButton).toHaveClass("bg-primary/20");
        });

        fireEvent.click(upvoteButton);

        await waitFor(() => {
            expect(toastErrorMock).toHaveBeenCalledWith("Could not update feedback right now.");
        });

        expect(upvoteButton).toHaveClass("bg-primary/20");
        expect(toastSuccessMock).not.toHaveBeenCalled();
    });

    it("only marks a downvote as saved after the server confirms it", async () => {
        fetchMock
            .mockResolvedValueOnce({
                ok: true,
                json: async () => ({ data: { status: null } }),
            })
            .mockResolvedValueOnce({
                ok: true,
                json: async () => ({ data: { status: null } }),
            })
            .mockResolvedValueOnce({
                ok: true,
                json: async () => ({ success: true }),
            });

        render(<ContentFeedback contentId="123e4567-e89b-12d3-a456-426614174111" />);

        await waitFor(() => {
            expect(fetchMock).toHaveBeenCalled();
        });

        const downvoteButton = screen.getByRole("button", { name: "Thumbs Down" });
        fireEvent.click(downvoteButton);

        expect(await screen.findByRole("dialog")).toBeInTheDocument();
        expect(downvoteButton).not.toHaveClass("bg-destructive/20");

        fireEvent.click(screen.getByRole("button", { name: "Skip" }));

        await waitFor(() => {
            expect(toastSuccessMock).toHaveBeenCalledWith("Feedback received. We'll use it to improve!");
        });

        expect(downvoteButton).toHaveClass("bg-destructive/20");
        expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });
});
