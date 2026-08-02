import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import {
    PreviewLoadingState,
    ReaderLoadingState,
} from "@/components/ui/ContentDetailLoadingStates";

describe("ContentDetailLoadingStates", () => {
    it("renders a preview-shaped loading state", () => {
        render(<PreviewLoadingState />);

        const loadingState = screen.getByRole("status", { name: "Loading preview" });
        expect(loadingState).toHaveAttribute("aria-busy", "true");
        expect(screen.getByTestId("content-detail-loading-cover")).toHaveClass("aspect-[2/3]");
        expect(screen.getByTestId("preview-loading-hook")).toBeInTheDocument();
        expect(screen.queryByTestId("route-loading-shelf-skeleton-card")).not.toBeInTheDocument();
    });

    it("renders a reader-shaped loading state", () => {
        render(<ReaderLoadingState />);

        const loadingState = screen.getByRole("status", { name: "Loading reader" });
        expect(loadingState).toHaveAttribute("aria-busy", "true");
        expect(screen.getByTestId("reader-loading-big-idea")).toBeInTheDocument();
        expect(screen.getAllByTestId("reader-loading-segment")).toHaveLength(4);
        expect(screen.queryByTestId("route-loading-shelf-skeleton-card")).not.toBeInTheDocument();
    });
});
