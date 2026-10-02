import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ComponentPropsWithoutRef, ReactNode } from "react";
import { RequestBoard } from "@/components/requests/RequestBoard";

const { authUser, fetchMock } = vi.hoisted(() => ({
    authUser: { value: null as { id: string } | null },
    fetchMock: vi.fn(),
}));

vi.mock("@/hooks/useAuthUser", () => ({ useAuthUser: () => authUser.value }));
vi.mock("@/components/ui/SignInLink", () => ({
    SignInLink: ({ children, onClick, ...props }: ComponentPropsWithoutRef<"a"> & { children: ReactNode }) => (
        <a {...props} href="/login?next=%2Frequests" onClick={(event) => {
            onClick?.(event);
            event.preventDefault();
        }}>{children}</a>
    ),
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

describe("RequestBoard sign-in return", () => {
    beforeEach(() => {
        authUser.value = null;
        window.sessionStorage.clear();
        fetchMock.mockReset();
        vi.stubGlobal("fetch", fetchMock);
    });

    it("restores the entered request after sign-in and clears it only after submission", async () => {
        const view = render(<RequestBoard />);
        fireEvent.change(screen.getByRole("combobox", { name: "Format" }), { target: { value: "book" } });
        fireEvent.change(screen.getByPlaceholderText("Paste a URL or type a title by author"), { target: { value: "A requested book" } });
        fireEvent.change(screen.getByPlaceholderText("Optional"), { target: { value: "A writer" } });
        fireEvent.click(screen.getByRole("link", { name: "Sign in to submit" }));

        expect(JSON.parse(window.sessionStorage.getItem("netflux_request_draft:v1")!)).toEqual({
            returnPath: `${window.location.pathname}${window.location.search}`,
            input: "A requested book",
            author: "A writer",
            contentType: "book",
        });

        view.unmount();
        authUser.value = { id: "reader-1" };
        fetchMock.mockResolvedValue({
            ok: true,
            json: async () => ({ data: { duplicate: false } }),
        });
        render(<RequestBoard />);

        await waitFor(() => {
            expect(screen.getByPlaceholderText("Paste a URL or type a title by author")).toHaveValue("A requested book");
        });
        expect(screen.getByPlaceholderText("Optional")).toHaveValue("A writer");
        expect(screen.getByRole("combobox", { name: "Format" })).toHaveValue("book");
        expect(fetchMock).not.toHaveBeenCalled();

        fireEvent.click(screen.getByRole("button", { name: "Submit request" }));
        await waitFor(() => expect(fetchMock).toHaveBeenCalledOnce());
        expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({
            input: "A requested book",
            author: "A writer",
            content_type: "book",
        });
        await waitFor(() => expect(window.sessionStorage.getItem("netflux_request_draft:v1")).toBeNull());
    });
});
