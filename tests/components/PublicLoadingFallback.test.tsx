import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import Loading from "@/app/(public)/loading";
import { getStorageScope, readerSettingsKey } from "@/lib/local-user-storage";

const route = vi.hoisted(() => ({ pathname: "/browse" as string | null }));
const auth = vi.hoisted(() => ({ user: undefined as { id: string } | null | undefined }));
vi.mock("next/navigation", () => ({ usePathname: () => route.pathname }));
vi.mock("@/hooks/useAuthUser", () => ({ useAuthUser: () => auth.user }));

describe("shared public loading boundary", () => {
    beforeEach(() => {
        route.pathname = "/browse";
        auth.user = undefined;
        vi.mocked(localStorage.getItem).mockReset();
    });

    it("switches the first shared fallback to Preview before a nested boundary arrives", () => {
        auth.user = { id: "account-a" };
        vi.mocked(localStorage.getItem).mockReturnValue(JSON.stringify({ state: { readerTheme: "sepia" } }));
        const { rerender } = render(<Loading />);
        expect(screen.getAllByTestId("route-loading-shelf-skeleton-card")).toHaveLength(18);
        expect(localStorage.getItem).not.toHaveBeenCalled();

        route.pathname = "/preview/book";
        rerender(<Loading />);
        expect(screen.getByRole("status", { name: "Loading preview" })).toHaveClass("reader-sepia");
        expect(screen.getByTestId("preview-loading-hook")).toBeInTheDocument();
        expect(screen.queryByTestId("route-loading-shelf-skeleton-card")).not.toBeInTheDocument();
        expect(localStorage.getItem).toHaveBeenCalledWith(readerSettingsKey(getStorageScope("account-a")));

        route.pathname = "/browse";
        rerender(<Loading />);
        expect(screen.getAllByTestId("route-loading-shelf-skeleton-card")).toHaveLength(18);
        expect(screen.queryByRole("status", { name: "Loading preview" })).not.toBeInTheDocument();
    });

    it("does not borrow a theme while account identity is unresolved or changes", () => {
        route.pathname = "/preview/book";
        vi.mocked(localStorage.getItem).mockImplementation(key => key === readerSettingsKey(getStorageScope("account-a"))
            ? JSON.stringify({ state: { readerTheme: "sepia" } })
            : null);
        const { rerender } = render(<Loading />);
        expect(screen.getByRole("status", { name: "Loading preview" })).toHaveClass("reader-dark");
        expect(localStorage.getItem).not.toHaveBeenCalled();

        auth.user = { id: "account-a" };
        rerender(<Loading />);
        expect(screen.getByRole("status", { name: "Loading preview" })).toHaveClass("reader-sepia");

        auth.user = { id: "account-b" };
        vi.mocked(localStorage.getItem).mockClear();
        rerender(<Loading />);
        expect(screen.getByRole("status", { name: "Loading preview" })).toHaveClass("reader-dark");
        expect(localStorage.getItem).not.toHaveBeenCalledWith(readerSettingsKey(getStorageScope("account-a")));
    });

    it.each(["/browse", "/search", "/read/book", "/preview-old/book", null])("preserves the existing fallback for %s", pathname => {
        route.pathname = pathname;
        render(<Loading />);
        expect(screen.getAllByTestId("route-loading-shelf-skeleton-card")).toHaveLength(18);
        expect(screen.queryByRole("status", { name: "Loading preview" })).not.toBeInTheDocument();
    });
});
