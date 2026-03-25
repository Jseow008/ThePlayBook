import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { SeriesSequenceList } from "@/components/ui/SeriesSequenceList";
import type { ContentItem } from "@/types/database";

vi.mock("next/link", () => ({
    default: ({
        children,
        href,
        ...props
    }: {
        children: React.ReactNode;
        href: string;
    }) => (
        <a href={href} {...props}>
            {children}
        </a>
    ),
}));

function createItem(overrides: Partial<ContentItem>): ContentItem {
    return {
        id: "item-1",
        title: "Default Title",
        type: "book",
        status: "verified",
        quick_mode_json: null,
        duration_seconds: 240,
        author: null,
        cover_image_url: null,
        hero_image_url: null,
        category: null,
        is_featured: false,
        embedding: null,
        audio_url: null,
        series_id: null,
        series_order: null,
        source_url: null,
        created_at: "2026-03-01T00:00:00.000Z",
        updated_at: "2026-03-01T00:00:00.000Z",
        deleted_at: null,
        ...overrides,
    };
}

describe("SeriesSequenceList", () => {
    it("renders the numbered badges in order", () => {
        render(
            <SeriesSequenceList
                items={[
                    createItem({ id: "item-1", title: "Matthew 1-4" }),
                    createItem({ id: "item-2", title: "Matthew 5-7", duration_seconds: 300 }),
                ]}
            />
        );

        expect(screen.getByText("1")).toBeInTheDocument();
        expect(screen.getByText("2")).toBeInTheDocument();
        expect(screen.getByText("Matthew 1-4")).toBeInTheDocument();
        expect(screen.getByText("Matthew 5-7")).toBeInTheDocument();
    });

    it("shows duration only when it exists", () => {
        render(
            <SeriesSequenceList
                items={[
                    createItem({ id: "item-1", title: "Timed Item", duration_seconds: 240 }),
                    createItem({ id: "item-2", title: "Untimed Item", duration_seconds: null }),
                ]}
            />
        );

        expect(screen.getByText("4 min")).toBeInTheDocument();
        expect(screen.queryByText("0 min")).not.toBeInTheDocument();
    });

    it("omits unnecessary metadata when it is missing", () => {
        render(
            <SeriesSequenceList
                items={[createItem({ id: "item-1", title: "Untimed Item", duration_seconds: null })]}
            />
        );

        expect(screen.getByText("book")).toBeInTheDocument();
        expect(screen.queryByText(/min/)).not.toBeInTheDocument();
    });

    it("keeps navigation actions hidden until the row expands", () => {
        render(
            <SeriesSequenceList
                items={[createItem({ id: "item-42", title: "Matthew 8-12" })]}
            />
        );

        expect(screen.queryByRole("link", { name: "Read Matthew 8-12" })).not.toBeInTheDocument();
        expect(screen.queryByRole("link", { name: "Preview Matthew 8-12" })).not.toBeInTheDocument();
    });

    it("renders item authors only when enabled", () => {
        const item = createItem({ id: "item-1", title: "Matthew 1-4", author: "Matthew Henry" });

        const { rerender } = render(<SeriesSequenceList items={[item]} showItemAuthors />);

        expect(screen.getByText("Matthew Henry")).toBeInTheDocument();

        rerender(<SeriesSequenceList items={[item]} />);

        expect(screen.queryByText("Matthew Henry")).not.toBeInTheDocument();
    });

    it("expands and collapses the hook inline", () => {
        render(
            <SeriesSequenceList
                items={[
                    createItem({
                        id: "item-1",
                        title: "Matthew 1-4",
                        quick_mode_json: {
                            hook: "A guided introduction to the opening movement of Matthew.",
                            big_idea: "Big idea",
                            key_takeaways: [],
                        } as ContentItem["quick_mode_json"],
                    }),
                ]}
            />
        );

        const toggle = screen.getByRole("button", { name: /Matthew 1-4/i });
        fireEvent.click(toggle);

        expect(screen.getByText("A guided introduction to the opening movement of Matthew.")).toBeInTheDocument();
        expect(screen.getByRole("link", { name: "Read Matthew 1-4" })).toHaveAttribute("href", "/read/item-1");
        expect(screen.getByRole("link", { name: "Preview Matthew 1-4" })).toHaveAttribute("href", "/preview/item-1");
        expect(toggle).toHaveAttribute("aria-expanded", "true");

        fireEvent.click(toggle);

        expect(screen.queryByText("A guided introduction to the opening movement of Matthew.")).not.toBeInTheDocument();
        expect(toggle).toHaveAttribute("aria-expanded", "false");
    });

    it("allows only one hook to stay open at a time", () => {
        render(
            <SeriesSequenceList
                items={[
                    createItem({
                        id: "item-1",
                        title: "Matthew 1-4",
                        quick_mode_json: {
                            hook: "Opening hook",
                            big_idea: "Big idea",
                            key_takeaways: [],
                        } as ContentItem["quick_mode_json"],
                    }),
                    createItem({
                        id: "item-2",
                        title: "Matthew 5-7",
                        quick_mode_json: {
                            hook: "Sermon hook",
                            big_idea: "Big idea",
                            key_takeaways: [],
                        } as ContentItem["quick_mode_json"],
                    }),
                ]}
            />
        );

        fireEvent.click(screen.getByRole("button", { name: /Matthew 1-4/i }));
        expect(screen.getByText("Opening hook")).toBeInTheDocument();
        expect(screen.getByRole("link", { name: "Read Matthew 1-4" })).toBeInTheDocument();

        fireEvent.click(screen.getByRole("button", { name: /Matthew 5-7/i }));
        expect(screen.queryByText("Opening hook")).not.toBeInTheDocument();
        expect(screen.queryByRole("link", { name: "Read Matthew 1-4" })).not.toBeInTheDocument();
        expect(screen.getByText("Sermon hook")).toBeInTheDocument();
    });

    it("still expands rows without hooks to reveal actions", () => {
        render(
            <SeriesSequenceList
                items={[createItem({ id: "item-1", title: "Matthew 1-4", quick_mode_json: null })]}
            />
        );

        const toggle = screen.getByRole("button", { name: /Matthew 1-4/i });
        fireEvent.click(toggle);

        expect(screen.getByRole("link", { name: "Read Matthew 1-4" })).toHaveAttribute("href", "/read/item-1");
        expect(screen.getByRole("link", { name: "Preview Matthew 1-4" })).toHaveAttribute("href", "/preview/item-1");
    });
});
