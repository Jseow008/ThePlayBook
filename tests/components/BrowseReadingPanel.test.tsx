import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { BrowseReadingPanel } from "@/components/ui/BrowseReadingPanel";

const mockUseReadingProgress = vi.fn();
const mockUseBatchContentItems = vi.fn();
const mockUseQuery = vi.fn();

vi.mock("@/hooks/useReadingProgress", () => ({
    useReadingProgress: () => mockUseReadingProgress(),
}));

vi.mock("@/hooks/use-content-queries", () => ({
    useBatchContentItems: (...args: unknown[]) => mockUseBatchContentItems(...args),
}));

vi.mock("@tanstack/react-query", () => ({
    useQuery: (options: unknown) => mockUseQuery(options),
}));

vi.mock("next/link", () => ({
    default: ({ children, href, ...props }: { children: React.ReactNode; href: string }) => (
        <a href={href} {...props}>{children}</a>
    ),
}));

describe("BrowseReadingPanel", () => {
    const resumeId = "11111111-1111-1111-1111-111111111111";
    const completedId = "22222222-2222-2222-2222-222222222222";
    const secondCompletedId = "33333333-3333-3333-3333-333333333333";

    beforeEach(() => {
        vi.clearAllMocks();
        vi.stubGlobal("matchMedia", vi.fn(() => ({
            matches: true,
            addEventListener: vi.fn(),
            removeEventListener: vi.fn(),
        })));
        mockUseReadingProgress.mockReturnValue({
            completedIds: [completedId, secondCompletedId],
            inProgressIds: [resumeId],
            isLoaded: true,
            user: { id: "reader-1" },
            getProgress: (id: string) => id === resumeId
                ? { completed: ["one", "two", "three"], totalSegments: 5 }
                : { completedAt: new Date().toISOString() },
        });
        mockUseBatchContentItems.mockReturnValue({
            data: [{ id: resumeId, title: "Deep Work", cover_image_url: null }],
            isPending: false,
        });
        mockUseQuery.mockReturnValue({
            data: [
                { activity_date: "2026-10-05", duration_seconds: 60 },
                { activity_date: "2026-10-06", duration_seconds: 120 },
            ],
            isPending: false,
        });
    });

    it("links to profile and resumes the latest unfinished read with its real progress", () => {
        render(<BrowseReadingPanel />);

        expect(screen.getByRole("link", { name: /view progress/i })).toHaveAttribute("href", "/profile");
        expect(screen.getByText("2")).toBeInTheDocument();
        expect(screen.getByText("reading days this week")).toBeInTheDocument();
        expect(screen.queryByText(/reads completed this month/i)).not.toBeInTheDocument();
        expect(screen.getByRole("link", { name: /continue reading/i })).toHaveAttribute(
            "href", `/read/${resumeId}/deep-work`,
        );
        expect(screen.getByRole("progressbar", { name: /reading progress for deep work/i }))
            .toHaveAttribute("aria-valuenow", "60");
    });

    it("does not load personal data for guests or mobile widths", () => {
        mockUseReadingProgress.mockReturnValue({
            completedIds: [], inProgressIds: [], isLoaded: true, user: null, getProgress: vi.fn(),
        });
        const { unmount } = render(<BrowseReadingPanel />);
        expect(screen.queryByTestId("browse-reading-panel")).not.toBeInTheDocument();
        expect(mockUseQuery.mock.lastCall?.[0]).toMatchObject({ enabled: false });

        vi.stubGlobal("matchMedia", vi.fn(() => ({
            matches: false,
            addEventListener: vi.fn(),
            removeEventListener: vi.fn(),
        })));
        unmount();
        mockUseReadingProgress.mockReturnValue({
            completedIds: [completedId], inProgressIds: [resumeId], isLoaded: true,
            user: { id: "reader-1" }, getProgress: vi.fn(),
        });
        render(<BrowseReadingPanel />);
        expect(screen.queryByTestId("browse-reading-panel")).not.toBeInTheDocument();
        expect(mockUseQuery.mock.lastCall?.[0]).toMatchObject({ enabled: false });
    });

    it("omits the continuation card when there is no unfinished read", () => {
        mockUseReadingProgress.mockReturnValue({
            completedIds: [completedId],
            inProgressIds: [],
            isLoaded: true,
            user: { id: "reader-1" },
            getProgress: () => ({ completedAt: new Date().toISOString() }),
        });
        mockUseBatchContentItems.mockReturnValue({ data: [], isPending: true });
        render(<BrowseReadingPanel />);

        expect(screen.getByTestId("browse-reading-panel")).toBeInTheDocument();
        expect(screen.queryByRole("heading", { name: "Continue reading" })).not.toBeInTheDocument();
    });

    it("uses singular wording for one reading day", () => {
        mockUseQuery.mockReturnValue({
            data: [{ activity_date: "2026-10-05", duration_seconds: 60 }],
            isPending: false,
        });
        render(<BrowseReadingPanel />);

        expect(screen.getByText("1")).toBeInTheDocument();
        expect(screen.getByText("reading day this week")).toBeInTheDocument();
    });
});
