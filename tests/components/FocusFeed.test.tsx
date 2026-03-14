import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ImgHTMLAttributes } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { FocusFeed } from "@/components/focus/FocusFeed";

const { routerPushMock, readingProgressState, mediaQueryState } = vi.hoisted(() => ({
    routerPushMock: vi.fn(),
    readingProgressState: {
        value: {
            completedIds: ["123e4567-e89b-12d3-a456-426614174111"],
            isLoaded: true,
        },
    },
    mediaQueryState: {
        value: false,
    },
}));

vi.mock("next/navigation", () => ({
    useRouter: () => ({ push: routerPushMock }),
}));

vi.mock("next/image", () => ({
    default: (
        props: ImgHTMLAttributes<HTMLImageElement> & {
            fill?: boolean;
            priority?: boolean;
            unoptimized?: boolean;
        }
    ) => {
        const { alt, src, fill, priority, unoptimized, ...safeProps } = props;
        void fill;
        void priority;
        void unoptimized;
        return <img alt={alt} src={src} {...safeProps} />;
    },
}));

vi.mock("@/hooks/useReadingProgress", () => ({
    useReadingProgress: () => readingProgressState.value,
}));

vi.mock("@/hooks/useMediaQuery", () => ({
    useMediaQuery: () => mediaQueryState.value,
}));

describe("FocusFeed", () => {
    const fetchMock = vi.fn();

    beforeEach(() => {
        vi.clearAllMocks();
        readingProgressState.value = {
            completedIds: ["123e4567-e89b-12d3-a456-426614174111"],
            isLoaded: true,
        };
        mediaQueryState.value = false;
        fetchMock.mockResolvedValue({
            ok: true,
            json: async () => [
                {
                    id: "123e4567-e89b-12d3-a456-426614174222",
                    title: "Essentialism",
                    type: "book",
                    author: "Greg McKeown",
                    category: "Productivity",
                    cover_image_url: "https://example.com/essentialism.jpg",
                    duration_seconds: 900,
                    quick_mode_json: {
                        hook: "Do less, but better.",
                        big_idea: "Eliminate the trivial to make room for the essential.",
                        key_takeaways: [
                            "Say no more often",
                            "Protect white space",
                            "Trade busyness for clarity",
                            "Audit every commitment",
                        ],
                    },
                },
            ],
        });
        vi.stubGlobal("fetch", fetchMock);
    });

    it("loads focus items with completed IDs excluded from the API query and uses the hook on mobile", async () => {
        render(<FocusFeed />);

        await waitFor(() => {
            expect(fetchMock).toHaveBeenCalledWith(
                expect.stringContaining(
                    "excludeIds=123e4567-e89b-12d3-a456-426614174111"
                )
            );
        });

        expect(await screen.findByText("Focus Mode")).toBeInTheDocument();
        expect(screen.queryByRole("heading", { name: "One idea per post" })).not.toBeInTheDocument();
        expect(await screen.findByText("Essentialism")).toBeInTheDocument();
        expect(screen.queryByText("Hook")).not.toBeInTheDocument();
        expect(screen.getByText("Key Takeaways")).toBeInTheDocument();
        expect(screen.queryByText("What stands out")).not.toBeInTheDocument();
        expect(screen.getByText("Do less, but better.")).toBeInTheDocument();
        expect(screen.queryByText("Eliminate the trivial to make room for the essential.")).not.toBeInTheDocument();
        expect(screen.getByText("Trade busyness for clarity")).toBeInTheDocument();
        expect(screen.queryByText("Audit every commitment")).not.toBeInTheDocument();
        expect(screen.getByTestId("focus-feed-list")).toHaveClass("overflow-y-auto");
        expect(screen.getByTestId("focus-feed-list")).toHaveClass("snap-mandatory");
        expect(screen.getByRole("button", { name: "View summary for Essentialism" })).not.toHaveClass("w-full");
        expect(screen.getByRole("heading", { name: "Essentialism" })).toHaveClass("text-[1.2rem]");
        expect(screen.getByRole("heading", { name: "Essentialism" })).toHaveClass("sm:text-[1.5rem]");
        expect(screen.getByText("Greg McKeown").parentElement).toHaveClass("text-[11px]");
        expect(screen.getByText("Do less, but better.")).toHaveClass("text-[0.95rem]");
        expect(screen.getByTestId("focus-feed-card")).toHaveClass("py-4");
    });

    it("shows a fourth takeaway on desktop", async () => {
        mediaQueryState.value = true;

        render(<FocusFeed />);

        expect(await screen.findByText("Audit every commitment")).toBeInTheDocument();
    });

    it("opens the full reader from the focus card", async () => {
        render(<FocusFeed />);

        const openButton = await screen.findByRole("button", {
            name: "View summary for Essentialism",
        });
        fireEvent.click(openButton);

        expect(routerPushMock).toHaveBeenCalledWith(
            "/read/123e4567-e89b-12d3-a456-426614174222"
        );
    });
});
