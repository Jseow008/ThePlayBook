import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ContentReplacementNotice } from "@/components/reader/ContentReplacementNotice";

describe("replacement notice", () => {
    it("explains separate positions and links to the kept summary without old segment/audio offsets", () => {
        render(<ContentReplacementNotice sourceId="old-id" sourceTitle="Old summary"
            replacement={{ id: "kept-id", title: "Updated summary" }} />);
        expect(screen.getByRole("heading", { name: "This summary has been replaced" })).toBeVisible();
        expect(screen.getByText(/Reading and listening positions are separate/)).toBeVisible();
        expect(screen.getByRole("link", { name: "Open updated summary" })).toHaveAttribute("href", "/read/kept-id/updated-summary");
        expect(screen.getByRole("link", { name: "View original notes" })).toHaveAttribute("href", "/notes?item=old-id");
    });
});
