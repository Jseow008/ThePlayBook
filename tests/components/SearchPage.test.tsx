import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import SearchPage from "@/app/(public)/search/page";
import type { ContentItem } from "@/types/database";

const mockContentCard = vi.fn(
    ({ item, titleDensity }: { item: ContentItem; titleDensity?: "default" | "app-compact" }) => (
        <div>{`${titleDensity ?? "default"}:${item.title}`}</div>
    )
);

const mockSearchInput = vi.fn(() => <div>Search Input</div>);
const mockSupabaseClient = {
    rpc: vi.fn(),
    from: vi.fn(),
};

vi.mock("@/lib/supabase/public-server", () => ({
    createPublicServerClient: () => mockSupabaseClient,
}));

vi.mock("@/components/ui/ContentCard", () => ({
    ContentCard: (props: { item: ContentItem; titleDensity?: "default" | "app-compact" }) => mockContentCard(props),
}));

vi.mock("@/components/ui/SearchInput", () => ({
    SearchInput: (props: unknown) => mockSearchInput(props),
}));

vi.mock("next/link", () => ({
    default: ({ children, href, ...props }: { children: React.ReactNode; href: string }) => (
        <a href={href} {...props}>
            {children}
        </a>
    ),
}));

describe("SearchPage", () => {
    const item: ContentItem = {
        id: "11111111-1111-1111-1111-111111111111",
        title: "Deep Work",
        type: "book",
        status: "verified",
        quick_mode_json: null,
        duration_seconds: 1800,
        author: "Cal Newport",
        cover_image_url: null,
        hero_image_url: null,
        category: "Productivity",
        is_featured: false,
        embedding: null,
        audio_url: null,
        source_url: null,
        created_at: "2026-03-01T00:00:00Z",
        updated_at: "2026-03-01T00:00:00Z",
        deleted_at: null,
    };

    beforeEach(() => {
        mockContentCard.mockClear();
        mockSearchInput.mockClear();
        mockSupabaseClient.rpc.mockReset();
        mockSupabaseClient.from.mockReset();
    });

    it("renders trending cards with compact app-surface title density", async () => {
        mockSupabaseClient.rpc.mockResolvedValue({ data: [item] });

        render(await SearchPage({ searchParams: Promise.resolve({}) }));

        expect(screen.getByText("app-compact:Deep Work")).toBeInTheDocument();
        expect(mockContentCard).toHaveBeenCalledWith(
            expect.objectContaining({
                item,
                titleDensity: "app-compact",
            })
        );
    });
});
