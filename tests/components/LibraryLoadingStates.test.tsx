import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import {
    LibraryGridSkeleton,
    LibraryToolbarSkeleton,
} from "@/components/ui/LibraryLoadingStates";

describe("Library loading states", () => {
    it("matches the five Library filters and mobile Sort height", () => {
        render(<LibraryToolbarSkeleton />);

        expect(screen.getAllByTestId("library-filter-skeleton")).toHaveLength(5);
        expect(screen.getAllByTestId("library-filter-skeleton").map((item) => item.className)).toEqual(
            expect.arrayContaining([expect.stringContaining("w-10"), expect.stringContaining("w-[4.5rem]")])
        );
    });

    it("uses the shared card corner radius", () => {
        const { container } = render(<LibraryGridSkeleton count={1} />);

        expect(container.firstElementChild?.firstElementChild).toHaveClass("rounded-md");
    });
});
