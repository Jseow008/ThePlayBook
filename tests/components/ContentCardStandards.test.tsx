import { readFileSync } from "node:fs";
import { join } from "node:path";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import Loading from "@/app/(public)/loading";
import {
    COMPACT_SHELF_SKELETON_CARD_CLASS,
    ROUTE_LOADING_SHELF_SKELETON_CARD_CLASS,
} from "@/components/ui/content-card-standards";

describe("content card responsive standards", () => {
    it("uses the compact shelf standard for public route loading skeletons", () => {
        const { container } = render(<Loading />);

        const firstCard = screen.getAllByTestId("route-loading-shelf-skeleton-card")[0];
        expect(firstCard).toHaveClass(...ROUTE_LOADING_SHELF_SKELETON_CARD_CLASS.split(" "));
        expect(container.firstElementChild).not.toHaveClass("lg:pl-16");
    });

    it("keeps the browse page fallback linked to the compact shelf skeleton standard", () => {
        // HomeFeedSkeleton is private inside an async App Router page, so this is
        // a source-linkage guard rather than a rendered DOM sizing assertion.
        const browsePageSource = readFileSync(
            join(process.cwd(), "app/(public)/browse/page.tsx"),
            "utf8"
        );

        expect(browsePageSource).toContain("COMPACT_SHELF_SKELETON_CARD_CLASS");
        expect(browsePageSource).toContain('className="browse-hero-shell w-full bg-card/20"');
        expect(browsePageSource).toContain("bg-card/30 rounded-md");
        expect(COMPACT_SHELF_SKELETON_CARD_CLASS).toContain("w-[176px]");
        expect(COMPACT_SHELF_SKELETON_CARD_CLASS).toContain("md:w-[240px]");
    });
});
