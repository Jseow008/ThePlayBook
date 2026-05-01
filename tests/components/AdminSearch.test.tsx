import { act, fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AdminSearch } from "@/components/admin/AdminSearch";

const { routerPushMock, routerReplaceMock, searchParamsState } = vi.hoisted(() => ({
    routerPushMock: vi.fn(),
    routerReplaceMock: vi.fn(),
    searchParamsState: { value: "" },
}));

vi.mock("next/navigation", () => ({
    useRouter: () => ({
        push: routerPushMock,
        replace: routerReplaceMock,
    }),
    useSearchParams: () => new URLSearchParams(searchParamsState.value),
}));

describe("AdminSearch", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        vi.useRealTimers();
        searchParamsState.value = "";
    });

    it("syncs the input when the route query changes externally", () => {
        searchParamsState.value = "q=Draft";

        const view = render(<AdminSearch />);
        const input = screen.getByPlaceholderText("Search content...");

        expect(input).toHaveValue("Draft");

        searchParamsState.value = "q=Published";
        view.rerender(<AdminSearch />);

        expect(input).toHaveValue("Published");
    });

    it("keeps the focused draft when an older route query arrives", () => {
        searchParamsState.value = "q=fo";

        const view = render(<AdminSearch />);
        const input = screen.getByPlaceholderText("Search content...");

        fireEvent.focus(input);
        fireEvent.change(input, {
            target: { value: "focus" },
        });

        searchParamsState.value = "q=foc";
        view.rerender(<AdminSearch />);

        expect(input).toHaveValue("focus");
    });

    it("uses replace for debounced search changes and preserves existing filters", async () => {
        vi.useFakeTimers();
        searchParamsState.value = "status=draft&type=book&page=4";

        render(<AdminSearch />);

        fireEvent.change(screen.getByPlaceholderText("Search content..."), {
            target: { value: "Focus" },
        });

        await act(async () => {
            vi.advanceTimersByTime(300);
        });

        expect(routerReplaceMock).toHaveBeenCalledWith("/admin/content?status=draft&type=book&page=1&q=Focus");
        expect(routerPushMock).not.toHaveBeenCalled();
    });

    it("keeps the latest requested query when a stale route update arrives after blur", async () => {
        vi.useFakeTimers();

        const view = render(<AdminSearch />);
        const input = screen.getByPlaceholderText("Search content...");

        fireEvent.focus(input);
        fireEvent.change(input, {
            target: { value: "focus" },
        });

        await act(async () => {
            vi.advanceTimersByTime(300);
        });

        expect(routerReplaceMock).toHaveBeenCalledWith("/admin/content?page=1&q=focus");

        fireEvent.blur(input);

        searchParamsState.value = "q=fo";
        view.rerender(<AdminSearch />);

        expect(input).toHaveValue("focus");

        searchParamsState.value = "q=focus";
        view.rerender(<AdminSearch />);

        expect(input).toHaveValue("focus");
    });

    it("clears the query from the URL without dropping other filters", async () => {
        vi.useFakeTimers();
        searchParamsState.value = "q=Focus&status=verified&page=3";

        render(<AdminSearch />);

        fireEvent.click(screen.getByRole("button", { name: /clear search/i }));

        await act(async () => {
            vi.advanceTimersByTime(300);
        });

        expect(screen.getByPlaceholderText("Search content...")).toHaveValue("");
        expect(routerReplaceMock).toHaveBeenCalledWith("/admin/content?status=verified&page=1");
    });
});
