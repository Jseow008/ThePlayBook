import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { LibraryToolbar } from "@/components/ui/LibraryToolbar";

describe("LibraryToolbar", () => {
    it("renders mobile controls as stacked filter and sort groups without horizontal scrolling", () => {
        render(
            <LibraryToolbar
                searchQuery=""
                onSearchChange={vi.fn()}
                activeFilter="all"
                onFilterChange={vi.fn()}
                activeSort="newest"
                onSortChange={vi.fn()}
            />
        );

        const controls = screen.getByTestId("library-toolbar-controls");
        const filters = screen.getByTestId("library-toolbar-filters");
        const sort = screen.getByTestId("library-toolbar-sort");

        expect(controls).toHaveClass("flex-wrap");
        expect(controls).toHaveClass("lg:flex-nowrap");
        expect(controls).not.toHaveClass("overflow-x-auto");
        expect(controls).not.toHaveClass("scrollbar-hide");

        expect(filters).toHaveClass("flex-wrap");
        expect(filters).toHaveClass("gap-2");
        expect(filters).toHaveClass("lg:rounded-full");

        expect(sort).toHaveClass("shrink-0");
        expect(screen.getByRole("combobox", { name: "Sort library items" })).toBeInTheDocument();
    });

    it("keeps filter and sort interactions working", () => {
        const onFilterChange = vi.fn();
        const onSortChange = vi.fn();

        render(
            <LibraryToolbar
                searchQuery=""
                onSearchChange={vi.fn()}
                activeFilter="all"
                onFilterChange={onFilterChange}
                activeSort="newest"
                onSortChange={onSortChange}
            />
        );

        fireEvent.click(screen.getByRole("button", { name: "podcast" }));
        fireEvent.change(screen.getByRole("combobox", { name: "Sort library items" }), { target: { value: "title" } });

        expect(onFilterChange).toHaveBeenCalledWith("podcast");
        expect(onSortChange).toHaveBeenCalledWith("title");
    });
});
