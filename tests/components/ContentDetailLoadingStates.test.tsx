import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { getStorageScope, readerSettingsKey } from "@/lib/local-user-storage";
import {
    PreviewLoadingState,
    ReaderLoadingState,
} from "@/components/ui/ContentDetailLoadingStates";

const auth = vi.hoisted(() => ({ user: undefined as { id: string } | null | undefined }));
vi.mock("@/hooks/useAuthUser", () => ({ useAuthUser: () => auth.user }));

describe("ContentDetailLoadingStates", () => {
    beforeEach(() => {
        auth.user = undefined;
        vi.mocked(localStorage.getItem).mockReset();
    });
    it("renders a preview-shaped loading state", () => {
        render(<PreviewLoadingState />);

        const loadingState = screen.getByRole("status", { name: "Loading preview" });
        expect(loadingState).toHaveAttribute("aria-busy", "true");
        expect(screen.getByTestId("content-detail-loading-cover")).toHaveClass("aspect-[2/3]");
        expect(screen.getByTestId("content-detail-loading-cover")).toHaveClass("rounded-2xl");
        expect(screen.getByTestId("preview-loading-hook")).toBeInTheDocument();
        expect(screen.queryByTestId("route-loading-shelf-skeleton-card")).not.toBeInTheDocument();
    });

    it("renders a reader-shaped loading state", () => {
        render(<ReaderLoadingState />);

        const loadingState = screen.getByRole("status", { name: "Loading reader" });
        expect(loadingState).toHaveAttribute("aria-busy", "true");
        expect(screen.getByTestId("content-detail-loading-cover")).toHaveClass("rounded-xl");
        expect(screen.getByTestId("content-detail-loading-cover")).not.toHaveClass("rounded-2xl");
        expect(screen.getByTestId("reader-loading-big-idea")).toBeInTheDocument();
        expect(screen.getAllByTestId("reader-loading-segment")).toHaveLength(4);
        expect(screen.queryByTestId("route-loading-shelf-skeleton-card")).not.toBeInTheDocument();
    });

    it("keeps unknown reading progress neutral", () => {
        render(<ReaderLoadingState />);
        expect(screen.getByTestId("reader-loading-progress-placeholder")).toBeEmptyDOMElement();
        expect(screen.queryByRole("progressbar")).not.toBeInTheDocument();
        expect(screen.getByRole("status", { name: "Loading reader" })).toHaveAttribute("aria-busy", "true");
    });

    it("uses the current account's cached theme and switches without borrowing the previous account", () => {
        vi.mocked(localStorage.getItem).mockImplementation(key => key === readerSettingsKey(getStorageScope("a"))
            ? JSON.stringify({ state: { readerTheme: "sepia" } })
            : key === readerSettingsKey(getStorageScope("b")) ? JSON.stringify({ state: { readerTheme: "light" } }) : null);
        auth.user = { id: "a" };
        const { rerender } = render(<ReaderLoadingState />);
        expect(screen.getByRole("status", { name: "Loading reader" })).toHaveClass("reader-sepia");
        auth.user = { id: "b" };
        vi.mocked(localStorage.getItem).mockClear();
        rerender(<ReaderLoadingState />);
        expect(screen.getByRole("status", { name: "Loading reader" })).toHaveClass("reader-light");
        expect(screen.getByRole("status", { name: "Loading reader" })).not.toHaveClass("reader-sepia");
        expect(localStorage.getItem).not.toHaveBeenCalledWith(readerSettingsKey(getStorageScope("a")));
    });

    it("does not read preferences before the account is resolved", () => {
        vi.mocked(localStorage.getItem).mockReturnValue(JSON.stringify({ state: { readerTheme: "sepia" } }));
        render(<ReaderLoadingState />);
        expect(screen.getByRole("status", { name: "Loading reader" })).toHaveClass("reader-dark");
        expect(localStorage.getItem).not.toHaveBeenCalled();
    });

    it("uses guest preferences only for a confirmed guest and tolerates invalid storage", () => {
        auth.user = null;
        vi.mocked(localStorage.getItem).mockReturnValue(JSON.stringify({ state: { readerTheme: "light" } }));
        const { rerender } = render(<ReaderLoadingState />);
        expect(screen.getByRole("status", { name: "Loading reader" })).toHaveClass("reader-light");
        expect(localStorage.getItem).toHaveBeenCalledWith(readerSettingsKey(getStorageScope(null)));
        vi.mocked(localStorage.getItem).mockImplementation(() => { throw new Error("storage unavailable"); });
        rerender(<ReaderLoadingState />);
        expect(screen.getByRole("status", { name: "Loading reader" })).toHaveClass("reader-dark");
    });
});
