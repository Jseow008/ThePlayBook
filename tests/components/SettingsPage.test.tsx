import { act, fireEvent, render, screen } from "@testing-library/react";
import type { AnchorHTMLAttributes } from "react";
import SettingsPage from "@/app/(public)/settings/page";
import { beforeEach, describe, expect, it, vi } from "vitest";

const clearScopedReadingHistoryMock = vi.fn();
const selectEqMock = vi.fn();
const deleteEqMock = vi.fn();
const fromMock = vi.fn((table: string) => ({
    select: () => ({
        eq: (column: string, value: string) => selectEqMock(table, column, value),
    }),
    delete: () => ({
        eq: (column: string, value: string) => deleteEqMock(column, value),
    }),
}));
const refreshMock = vi.fn();
const clearCachedRecommendationsMock = vi.fn();
const clearRecentRecommendationsMock = vi.fn();
const toastErrorMock = vi.fn();
const toastSuccessMock = vi.fn();
const signOutActionMock = vi.fn();
let currentUser: { id: string; email?: string; user_metadata?: { full_name?: string } } | null = null;

vi.mock("next/link", () => ({
    default: ({ children, href, ...props }: AnchorHTMLAttributes<HTMLAnchorElement>) => (
        <a href={href} {...props}>
            {children}
        </a>
    ),
}));

vi.mock("@/lib/supabase/client", () => ({
    createClient: () => ({
        auth: {
            getUser: vi.fn().mockResolvedValue({
                data: { user: currentUser },
            }),
        },
        from: fromMock,
    }),
}));

vi.mock("@/hooks/useReadingProgress", () => ({
    useReadingProgress: () => ({
        refresh: refreshMock,
        storageScope: "user:test-user",
    }),
}));

vi.mock("@/lib/actions/auth", () => ({
    signOutAction: () => signOutActionMock(),
}));

vi.mock("@/lib/local-user-storage", () => ({
    clearScopedReadingHistory: (...args: unknown[]) => clearScopedReadingHistoryMock(...args),
}));

vi.mock("@/lib/recommendation-memory", () => ({
    clearCachedRecommendations: (...args: unknown[]) => clearCachedRecommendationsMock(...args),
    clearRecentRecommendations: (...args: unknown[]) => clearRecentRecommendationsMock(...args),
}));

vi.mock("sonner", () => ({
    toast: {
        error: (...args: unknown[]) => toastErrorMock(...args),
        success: (...args: unknown[]) => toastSuccessMock(...args),
    },
}));

describe("SettingsPage", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        currentUser = null;
        signOutActionMock.mockResolvedValue(undefined);
        selectEqMock.mockResolvedValue({ data: [], error: null });
        deleteEqMock.mockResolvedValue({ error: null });
    });

    it("includes a replay app tour link", async () => {
        render(<SettingsPage />);

        expect(screen.getByRole("button", { name: /clear reading history/i })).toBeDisabled();
        expect(await screen.findByText("Not signed in.")).toBeInTheDocument();
        expect(screen.getByRole("link", { name: /replay app tour/i })).toHaveAttribute(
            "href",
            "/browse?tour=app-v1"
        );
    });

    it("clears local history and recommendation memory when clearing reading history as a guest", async () => {
        render(<SettingsPage />);

        await screen.findByText("Not signed in.");

        const clearButton = screen.getByRole("button", { name: /clear reading history/i });
        act(() => {
            fireEvent.click(clearButton);
        });

        vi.useFakeTimers();
        const confirmButton = screen.getByRole("button", { name: /click again to confirm/i });
        await act(async () => {
            fireEvent.click(confirmButton);
            vi.runAllTimers();
        });

        expect(clearScopedReadingHistoryMock).toHaveBeenCalledWith(localStorage, "user:test-user");
        expect(clearCachedRecommendationsMock).toHaveBeenCalledWith(localStorage, "user:test-user");
        expect(clearRecentRecommendationsMock).toHaveBeenCalledWith(localStorage, "user:test-user");
        expect(refreshMock).toHaveBeenCalled();
        expect(fromMock).not.toHaveBeenCalled();
        expect(toastSuccessMock).toHaveBeenCalledWith("Reading history cleared");
        vi.useRealTimers();
    });

    it("clears cloud-backed library rows before clearing local state for signed-in users", async () => {
        currentUser = {
            id: "user-123",
            email: "reader@example.com",
            user_metadata: { full_name: "Reader" },
        };

        render(<SettingsPage />);

        await screen.findByDisplayValue("reader@example.com");

        act(() => {
            fireEvent.click(screen.getByRole("button", { name: /clear reading history/i }));
        });

        vi.useFakeTimers();
        await act(async () => {
            fireEvent.click(screen.getByRole("button", { name: /click again to confirm/i }));
            vi.runAllTimers();
        });

        expect(fromMock).toHaveBeenCalledWith("user_library");
        expect(deleteEqMock).toHaveBeenCalledWith("user_id", "user-123");
        expect(clearScopedReadingHistoryMock).toHaveBeenCalledWith(localStorage, "user:test-user");
        expect(refreshMock).toHaveBeenCalled();
        expect(toastSuccessMock).toHaveBeenCalledWith("Reading history cleared");
        vi.useRealTimers();
    });

    it("does not clear local state when the signed-in cloud reset fails", async () => {
        currentUser = {
            id: "user-456",
            email: "reader2@example.com",
        };
        deleteEqMock.mockResolvedValue({ error: { message: "Delete failed" } });

        render(<SettingsPage />);

        await screen.findByDisplayValue("reader2@example.com");

        act(() => {
            fireEvent.click(screen.getByRole("button", { name: /clear reading history/i }));
        });

        vi.useFakeTimers();
        await act(async () => {
            fireEvent.click(screen.getByRole("button", { name: /click again to confirm/i }));
            vi.runAllTimers();
        });

        expect(clearScopedReadingHistoryMock).not.toHaveBeenCalled();
        expect(refreshMock).not.toHaveBeenCalled();
        expect(toastErrorMock).toHaveBeenCalledWith("Delete failed");
        vi.useRealTimers();
    });

    it("fails export instead of downloading partial data when any export query errors", async () => {
        currentUser = {
            id: "user-789",
            email: "reader3@example.com",
        };
        selectEqMock.mockImplementation((table: string) => {
            if (table === "reading_activity") {
                return Promise.resolve({ data: null, error: { message: "Activity export failed" } });
            }

            return Promise.resolve({ data: [], error: null });
        });

        render(<SettingsPage />);

        await screen.findByDisplayValue("reader3@example.com");

        await act(async () => {
            fireEvent.click(screen.getByRole("button", { name: /download my data/i }));
        });

        expect(toastErrorMock).toHaveBeenCalledWith("Failed to export data");
        expect(toastSuccessMock).not.toHaveBeenCalledWith("Data export complete");
    });

    it("recovers the sign-out button when sign-out fails", async () => {
        currentUser = {
            id: "user-999",
            email: "reader4@example.com",
        };
        signOutActionMock.mockRejectedValue(new Error("Sign out failed"));

        render(<SettingsPage />);

        await screen.findByDisplayValue("reader4@example.com");

        const signOutButton = screen.getByRole("button", { name: /sign out/i });

        await act(async () => {
            fireEvent.click(signOutButton);
        });

        expect(toastErrorMock).toHaveBeenCalledWith("Sign out failed");
        expect(screen.getByRole("button", { name: /sign out/i })).not.toBeDisabled();
        expect(screen.queryByText("Signing out...")).not.toBeInTheDocument();
    });
});
