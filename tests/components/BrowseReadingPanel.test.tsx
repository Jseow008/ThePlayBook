import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { BrowseReadingPanel } from "@/components/ui/BrowseReadingPanel";

const mockUseReadingProgress = vi.fn();
const mockUseAuthUser = vi.fn();
const mockUseBatchContentItems = vi.fn();
const mockUseQuery = vi.fn();
const mockRetryHydration = vi.fn();
const mockRefetchActivity = vi.fn();
const mockRefetchResume = vi.fn();

vi.mock("@/hooks/useReadingProgress", () => ({
    useReadingProgress: () => mockUseReadingProgress(),
}));

vi.mock("@/hooks/useAuthUser", () => ({
    useAuthUser: () => mockUseAuthUser(),
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
        mockUseAuthUser.mockReturnValue({ id: "reader-1" });
        vi.stubGlobal("matchMedia", vi.fn(() => ({
            matches: true,
            addEventListener: vi.fn(),
            removeEventListener: vi.fn(),
        })));
        mockUseReadingProgress.mockReturnValue({
            completedIds: [completedId, secondCompletedId],
            inProgressIds: [resumeId],
            isLoaded: true,
            hydrationStatus: "ready",
            retryHydration: mockRetryHydration,
            user: { id: "reader-1" },
            getProgress: (id: string) => id === resumeId
                ? { completed: ["one", "two", "three"], totalSegments: 5 }
                : { completedAt: new Date().toISOString() },
        });
        mockUseBatchContentItems.mockReturnValue({
            data: [{ id: resumeId, title: "Deep Work", cover_image_url: null }],
            isPending: false,
            isError: false,
            refetch: mockRefetchResume,
        });
        mockUseQuery.mockReturnValue({
            data: [
                { activity_date: "2026-10-05", duration_seconds: 60 },
                { activity_date: "2026-10-06", duration_seconds: 120 },
            ],
            isPending: false,
            isError: false,
            refetch: mockRefetchActivity,
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
        mockUseAuthUser.mockReturnValue(null);
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
        mockUseAuthUser.mockReturnValue({ id: "reader-1" });
        mockUseReadingProgress.mockReturnValue({
            completedIds: [completedId], inProgressIds: [resumeId], isLoaded: true,
            user: { id: "reader-1" }, getProgress: vi.fn(),
        });
        render(<BrowseReadingPanel />);
        expect(screen.queryByTestId("browse-reading-panel")).not.toBeInTheDocument();
        expect(mockUseQuery.mock.lastCall?.[0]).toMatchObject({ enabled: false });
    });

    it("reserves the card while account progress loads and starts activity in parallel", () => {
        mockUseReadingProgress.mockReturnValue({
            completedIds: [], inProgressIds: [], isLoaded: false, user: null,
            hydrationStatus: "hydrating", retryHydration: mockRetryHydration, getProgress: vi.fn(),
        });
        mockUseQuery.mockReturnValue({ data: undefined, isPending: true, isError: false, refetch: mockRefetchActivity });
        render(<BrowseReadingPanel />);

        expect(screen.getByTestId("browse-reading-panel")).toBeInTheDocument();
        expect(screen.getByRole("status", { name: "Loading reading activity" })).toBeInTheDocument();
        expect(screen.getByRole("heading", { name: "Your reading" }).closest("section"))
            .toHaveAttribute("aria-busy", "true");
        expect(mockUseQuery.mock.lastCall?.[0]).toMatchObject({ enabled: true });
        expect(mockUseBatchContentItems.mock.lastCall?.[1]).toMatchObject({ enabled: false });
    });

    it("keeps an empty state in the reserved card after a slow empty-account load", () => {
        mockUseBatchContentItems.mockReturnValue({ data: [], isPending: false, isError: false, refetch: mockRefetchResume });
        mockUseReadingProgress.mockReturnValue({
            completedIds: [], inProgressIds: [], isLoaded: false,
            user: { id: "reader-1" }, hydrationStatus: "hydrating", getProgress: vi.fn(),
        });
        mockUseQuery.mockReturnValue({ data: undefined, isPending: true, isError: false, refetch: mockRefetchActivity });
        const { rerender } = render(<BrowseReadingPanel />);
        const panel = screen.getByTestId("browse-reading-panel");

        mockUseReadingProgress.mockReturnValue({
            completedIds: [], inProgressIds: [], isLoaded: true,
            user: { id: "reader-1" }, hydrationStatus: "ready", getProgress: vi.fn(),
        });
        mockUseQuery.mockReturnValue({ data: [], isPending: false, isError: false, refetch: mockRefetchActivity });
        rerender(<BrowseReadingPanel />);

        expect(screen.getByTestId("browse-reading-panel")).toBe(panel);
        expect(screen.getByText("No reading days yet this week")).toBeInTheDocument();
        expect(screen.queryByRole("heading", { name: "Continue reading" })).not.toBeInTheDocument();
    });

    it("shows the weekly count while progress is still hydrating", () => {
        mockUseBatchContentItems.mockReturnValue({ data: [], isPending: false, isError: false, refetch: mockRefetchResume });
        mockUseReadingProgress.mockReturnValue({
            completedIds: [], inProgressIds: [], isLoaded: false, user: { id: "reader-1" },
            hydrationStatus: "hydrating", retryHydration: mockRetryHydration, getProgress: vi.fn(),
        });
        render(<BrowseReadingPanel />);

        expect(screen.getByText("2")).toBeInTheDocument();
        expect(screen.queryByRole("status", { name: "Loading reading activity" })).not.toBeInTheDocument();
        expect(screen.getByRole("link", { name: /view progress/i })).toHaveAttribute("href", "/profile");
    });

    it("does not show the previous account's unfinished read during an account switch", () => {
        mockUseAuthUser.mockReturnValue({ id: "reader-2" });
        render(<BrowseReadingPanel />);

        expect(screen.queryByText("Deep Work")).not.toBeInTheDocument();
        expect(screen.queryByRole("link", { name: /continue reading/i })).not.toBeInTheDocument();
        expect(mockUseBatchContentItems.mock.lastCall?.[1]).toMatchObject({ enabled: false });
    });

    it("offers a retry when weekly activity is unavailable", () => {
        mockUseBatchContentItems.mockReturnValue({ data: [], isPending: false, isError: false, refetch: mockRefetchResume });
        mockUseReadingProgress.mockReturnValue({
            completedIds: [], inProgressIds: [], isLoaded: true, user: { id: "reader-1" },
            hydrationStatus: "ready", retryHydration: mockRetryHydration, getProgress: vi.fn(),
        });
        mockUseQuery.mockReturnValue({ data: undefined, isPending: false, isError: true, refetch: mockRefetchActivity });
        render(<BrowseReadingPanel />);

        expect(screen.getByRole("alert")).toHaveTextContent("Reading activity is unavailable");
        fireEvent.click(screen.getByRole("button", { name: "Retry" }));
        expect(mockRefetchActivity).toHaveBeenCalledOnce();
    });

    it("offers recovery when account progress hydration fails", () => {
        mockUseBatchContentItems.mockReturnValue({ data: [], isPending: false, isError: false, refetch: mockRefetchResume });
        mockUseReadingProgress.mockReturnValue({
            completedIds: [], inProgressIds: [], isLoaded: true, user: { id: "reader-1" },
            hydrationStatus: "error", retryHydration: mockRetryHydration, getProgress: vi.fn(),
        });
        render(<BrowseReadingPanel />);

        expect(screen.getByText(/could not check unfinished reads/i)).toBeInTheDocument();
        expect(screen.queryByRole("heading", { name: "Continue reading" })).not.toBeInTheDocument();
        fireEvent.click(screen.getByRole("button", { name: "Retry" }));
        expect(mockRetryHydration).toHaveBeenCalledOnce();
    });

    it("keeps both retry actions available when activity and progress fail together", () => {
        mockUseBatchContentItems.mockReturnValue({ data: [], isPending: false, isError: false, refetch: mockRefetchResume });
        mockUseReadingProgress.mockReturnValue({
            completedIds: [], inProgressIds: [], isLoaded: false, user: { id: "reader-1" },
            hydrationStatus: "error", retryHydration: mockRetryHydration, getProgress: vi.fn(),
        });
        mockUseQuery.mockReturnValue({ data: undefined, isPending: false, isError: true, refetch: mockRefetchActivity });
        render(<BrowseReadingPanel />);

        const activityAlert = screen.getByText("Reading activity is unavailable.").closest('[role="alert"]');
        const progressAlert = screen.getByText(/Could not check unfinished reads/).closest('[role="alert"]');
        expect(activityAlert).toBeInTheDocument();
        expect(progressAlert).toBeInTheDocument();
        fireEvent.click(activityAlert!.querySelector("button")!);
        fireEvent.click(progressAlert!.querySelector("button")!);
        expect(mockRefetchActivity).toHaveBeenCalledOnce();
        expect(mockRetryHydration).toHaveBeenCalledOnce();
    });

    it("keeps unfinished-read recovery in its own card when an item is known", () => {
        mockUseReadingProgress.mockReturnValue({
            completedIds: [], inProgressIds: [resumeId], isLoaded: true, user: { id: "reader-1" },
            hydrationStatus: "error", retryHydration: mockRetryHydration, getProgress: vi.fn(),
        });
        mockUseBatchContentItems.mockReturnValue({ data: [], isPending: false, isError: false, refetch: mockRefetchResume });
        render(<BrowseReadingPanel />);

        expect(screen.getByRole("heading", { name: "Continue reading" })).toBeInTheDocument();
        expect(screen.getByRole("alert")).toHaveTextContent("Reading progress is unavailable");
        fireEvent.click(screen.getByRole("button", { name: "Retry" }));
        expect(mockRetryHydration).toHaveBeenCalledOnce();
    });

    it("keeps the second card through a slow unfinished-read load and handles failure", () => {
        mockUseBatchContentItems.mockReturnValue({ data: [], isPending: true, isError: false, refetch: mockRefetchResume });
        const { rerender } = render(<BrowseReadingPanel />);
        const panel = screen.getByTestId("browse-reading-panel");
        expect(screen.getByRole("heading", { name: "Continue reading" })).toBeInTheDocument();

        mockUseBatchContentItems.mockReturnValue({ data: [], isPending: false, isError: true, refetch: mockRefetchResume });
        rerender(<BrowseReadingPanel />);
        expect(screen.getByTestId("browse-reading-panel")).toBe(panel);
        expect(screen.getByRole("alert")).toHaveTextContent("Continue reading is unavailable");
        fireEvent.click(screen.getByRole("button", { name: "Retry" }));
        expect(mockRefetchResume).toHaveBeenCalledOnce();

        mockUseBatchContentItems.mockReturnValue({ data: [{ id: resumeId, title: "Deep Work", cover_image_url: null }], isPending: false, isError: false, refetch: mockRefetchResume });
        rerender(<BrowseReadingPanel />);
        expect(screen.getByTestId("browse-reading-panel")).toBe(panel);
        expect(screen.getByRole("link", { name: /continue reading/i })).toBeInTheDocument();
    });

    it("keeps the weekly count visible when an unfinished read is discovered later", () => {
        mockUseReadingProgress.mockReturnValue({
            completedIds: [], inProgressIds: [], isLoaded: false, user: { id: "reader-1" },
            hydrationStatus: "hydrating", retryHydration: mockRetryHydration, getProgress: vi.fn(),
        });
        mockUseBatchContentItems.mockReturnValue({ data: [], isPending: false, isError: false, refetch: mockRefetchResume });
        const { rerender } = render(<BrowseReadingPanel />);
        const panel = screen.getByTestId("browse-reading-panel");
        expect(screen.getByText("2")).toBeInTheDocument();
        expect(screen.queryByRole("heading", { name: "Continue reading" })).not.toBeInTheDocument();

        mockUseReadingProgress.mockReturnValue({
            completedIds: [], inProgressIds: [resumeId], isLoaded: true, user: { id: "reader-1" },
            hydrationStatus: "ready", retryHydration: mockRetryHydration, getProgress: vi.fn(),
        });
        mockUseBatchContentItems.mockReturnValue({ data: [], isPending: true, isError: false, refetch: mockRefetchResume });
        rerender(<BrowseReadingPanel />);
        expect(screen.getByTestId("browse-reading-panel")).toBe(panel);
        expect(screen.getByText("2")).toBeInTheDocument();
        expect(screen.getByRole("heading", { name: "Continue reading" })).toBeInTheDocument();
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
