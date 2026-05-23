import { act, fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AdminLogoutButton } from "@/components/admin/AdminLogoutButton";

const routerPushMock = vi.fn();
const routerRefreshMock = vi.fn();
const browserSignOutMock = vi.fn();

vi.mock("next/navigation", () => ({
    useRouter: () => ({
        push: routerPushMock,
        refresh: routerRefreshMock,
    }),
}));

vi.mock("@/lib/supabase/client", () => ({
    createClient: () => ({
        auth: {
            signOut: browserSignOutMock,
        },
    }),
}));

describe("AdminLogoutButton", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        browserSignOutMock.mockResolvedValue({ error: null });
        global.fetch = vi.fn().mockResolvedValue({ ok: true }) as typeof fetch;
    });

    it("checks the logout response, signs out in the browser, and redirects on success", async () => {
        render(<AdminLogoutButton />);

        await act(async () => {
            fireEvent.click(screen.getByRole("button", { name: /logout/i }));
        });

        expect(global.fetch).toHaveBeenCalledWith("/api/admin/logout", { method: "POST" });
        expect(browserSignOutMock).toHaveBeenCalledTimes(1);
        expect(routerPushMock).toHaveBeenCalledWith("/admin-login");
        expect(routerRefreshMock).toHaveBeenCalledTimes(1);
    });

    it("does not redirect when the logout API fails", async () => {
        global.fetch = vi.fn().mockResolvedValue({ ok: false }) as typeof fetch;

        render(<AdminLogoutButton />);

        await act(async () => {
            fireEvent.click(screen.getByRole("button", { name: /logout/i }));
        });

        expect(browserSignOutMock).not.toHaveBeenCalled();
        expect(routerPushMock).not.toHaveBeenCalled();
        expect(routerRefreshMock).not.toHaveBeenCalled();
        expect(screen.getByRole("alert")).toHaveTextContent("Logout failed. Please try again.");
    });
});
