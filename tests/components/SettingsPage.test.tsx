import { act, fireEvent, render, screen } from "@testing-library/react";
import type { AnchorHTMLAttributes } from "react";
import SettingsPage from "@/app/(public)/settings/page";
import { beforeEach, describe, expect, it, vi } from "vitest";

const refreshMock = vi.fn();
const clearRecentRecommendationsMock = vi.fn();

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
                data: { user: null },
            }),
        },
    }),
}));

vi.mock("@/hooks/useReadingProgress", () => ({
    useReadingProgress: () => ({
        refresh: refreshMock,
        storageScope: "user:test-user",
    }),
}));

vi.mock("@/lib/actions/auth", () => ({
    signOutAction: vi.fn(),
}));

vi.mock("@/lib/recommendation-memory", () => ({
    clearRecentRecommendations: (...args: unknown[]) => clearRecentRecommendationsMock(...args),
}));

describe("SettingsPage", () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it("includes a replay app tour link", async () => {
        render(<SettingsPage />);

        expect(await screen.findByText("Not signed in.")).toBeInTheDocument();
        expect(screen.getByRole("link", { name: /replay app tour/i })).toHaveAttribute(
            "href",
            "/browse?tour=app-v1"
        );
    });

    it("clears recent recommendation memory when clearing reading history", async () => {
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

        expect(clearRecentRecommendationsMock).toHaveBeenCalledWith(localStorage, "user:test-user");
        expect(refreshMock).toHaveBeenCalled();
        vi.useRealTimers();
    });
});
