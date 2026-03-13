import { render, screen, fireEvent } from "@testing-library/react";
import { AskClientPage } from "@/app/(public)/ask/client-page";
import { useChat } from "@ai-sdk/react";
import { vi } from "vitest";
import type { LibrarySnapshot } from "@/lib/server/library-snapshot";

const {
    scrollIntoViewMock,
    infiniteHighlightsState,
} = vi.hoisted(() => ({
    scrollIntoViewMock: vi.fn(),
    infiniteHighlightsState: {
        value: {
            data: undefined,
            isLoading: false,
            isError: false,
        } as {
            data:
                | {
                    pages: Array<{
                        data: Array<Record<string, unknown>>;
                        nextCursor: string | null;
                    }>;
                    pageParams: Array<string | null>;
                }
                | undefined;
            isLoading: boolean;
            isError: boolean;
        },
    },
}));

vi.mock("@ai-sdk/react", () => ({
    useChat: vi.fn(),
}));

vi.mock("@/hooks/useHighlights", () => ({
    useInfiniteHighlights: () => infiniteHighlightsState.value,
}));

const notesAskPanelMock = vi.fn();

vi.mock("@/components/notes/NotesAskPanel", () => ({
    NotesAskPanel: (props: any) => {
        notesAskPanelMock(props);
        return <div data-testid="notes-page-panel">Notes page panel</div>;
    },
}));

vi.mock("next/link", () => ({
    default: ({ children, href }: { children: React.ReactNode; href: string }) => (
        <a href={href}>{children}</a>
    ),
}));

describe("AskClientPage", () => {
    const defaultSnapshot: LibrarySnapshot = {
        totalItems: 53,
        completedCount: 16,
        inProgressCount: 37,
        savedButNotStartedCount: 0,
        authorNames: ["David Goggins"],
    };

    beforeAll(() => {
        Object.defineProperty(HTMLElement.prototype, "scrollIntoView", {
            configurable: true,
            value: scrollIntoViewMock,
        });
    });

    beforeEach(() => {
        vi.clearAllMocks();
        notesAskPanelMock.mockClear();
        Object.defineProperty(window, "matchMedia", {
            writable: true,
            value: vi.fn().mockImplementation((query: string) => ({
                matches: false,
                media: query,
                onchange: null,
                addEventListener: vi.fn(),
                removeEventListener: vi.fn(),
                addListener: vi.fn(),
                removeListener: vi.fn(),
                dispatchEvent: vi.fn(),
            })),
        });
        infiniteHighlightsState.value = {
            data: undefined,
            isLoading: false,
            isError: false,
        };
        (useChat as any).mockReturnValue({
            messages: [],
            sendMessage: vi.fn(),
            status: "ready",
            error: null,
        });
    });

    it("renders the empty state and starter prompts", () => {
        render(<AskClientPage initialLibrarySnapshot={defaultSnapshot} />);

        expect(screen.getByRole("heading", { name: "Ask My Library" })).toBeInTheDocument();
        expect(screen.getByText("Ask across your reading life")).toBeInTheDocument();
        expect(screen.getByText("53 in library")).toBeInTheDocument();
        expect(screen.getByText("0 saved but not started")).toBeInTheDocument();
        expect(screen.getByText("Good places to start")).toBeInTheDocument();
        expect(scrollIntoViewMock).not.toHaveBeenCalled();
        expect(screen.getByRole("button", { name: "What have I completed in my library?" })).toBeInTheDocument();
        expect(screen.getByRole("button", { name: "Which authors show up most in my saved books?" })).toBeInTheDocument();
        expect(screen.getByRole("button", { name: "Which saved book is most relevant to discipline, and why?" })).toBeInTheDocument();
        expect(screen.getByRole("button", { name: "What themes show up across my saved books?" })).toBeInTheDocument();
    });

    it("uses the default back link when no return context is provided", () => {
        render(<AskClientPage initialLibrarySnapshot={defaultSnapshot} />);

        expect(screen.getAllByRole("link")[0]).toHaveAttribute("href", "/");
    });

    it("uses the notes back link when return context is provided", () => {
        render(<AskClientPage returnTo="/notes?ask=1" />);

        expect(screen.getAllByRole("link")[0]).toHaveAttribute("href", "/notes?ask=1");
    });

    it("renders the mobile Ask subnav and notes-scoped page when scope=notes", () => {
        infiniteHighlightsState.value = {
            data: {
                pages: [
                    {
                        data: [
                            {
                                id: "highlight-1",
                                user_id: "user-1",
                                content_item_id: "content-1",
                                segment_id: "seg-1",
                                highlighted_text: "A saved note",
                                note_body: "note",
                                color: "blue",
                                anchor_start: 0,
                                anchor_end: 10,
                                created_at: "2026-03-11T12:00:00.000Z",
                                updated_at: null,
                                content_item: null,
                                segment: null,
                            },
                        ],
                        nextCursor: null,
                    },
                ],
                pageParams: [null],
            },
            isLoading: false,
            isError: false,
        };

        render(<AskClientPage scope="notes" />);

        expect(screen.getByRole("link", { name: "Ask My Library" })).toHaveAttribute("href", "/ask");
        expect(screen.getByRole("link", { name: "Ask These Notes" })).toHaveAttribute("href", "/ask?scope=notes");
        expect(screen.getByTestId("notes-page-panel")).toBeInTheDocument();
        expect(notesAskPanelMock).toHaveBeenCalledWith(
            expect.objectContaining({
                currentScope: expect.objectContaining({
                    noteCount: 1,
                    totalMatches: 1,
                    summary: "All content",
                }),
                variant: "page",
            })
        );
    });

    it("honors notes scope on desktop instead of forcing library scope", () => {
        Object.defineProperty(window, "matchMedia", {
            writable: true,
            value: vi.fn().mockImplementation((query: string) => ({
                matches: true,
                media: query,
                onchange: null,
                addEventListener: vi.fn(),
                removeEventListener: vi.fn(),
                addListener: vi.fn(),
                removeListener: vi.fn(),
                dispatchEvent: vi.fn(),
            })),
        });

        infiniteHighlightsState.value = {
            data: {
                pages: [{ data: [], nextCursor: null }],
                pageParams: [null],
            },
            isLoading: false,
            isError: false,
        };

        render(<AskClientPage scope="notes" />);

        expect(screen.getByRole("heading", { name: "Ask These Notes" })).toBeInTheDocument();
        expect(screen.getByTestId("notes-page-panel")).toBeInTheDocument();
    });

    it("sends the selected starter prompt", () => {
        const mockSendMessage = vi.fn();
        (useChat as any).mockReturnValue({
            messages: [],
            sendMessage: mockSendMessage,
            status: "ready",
            error: null,
        });

        render(<AskClientPage initialLibrarySnapshot={defaultSnapshot} />);

        fireEvent.click(screen.getByRole("button", { name: "What have I completed in my library?" }));

        expect(mockSendMessage).toHaveBeenCalledWith({ text: "What have I completed in my library?" });
    });

    it("shows the transcript after chat starts instead of the intro panel", () => {
        (useChat as any).mockReturnValue({
            messages: [
                {
                    id: "u1",
                    role: "user",
                    content: "Find patterns in my reading",
                },
            ],
            sendMessage: vi.fn(),
            status: "ready",
            error: null,
        });

        render(<AskClientPage initialLibrarySnapshot={defaultSnapshot} />);

        expect(screen.queryByText("Search the ideas you've saved")).not.toBeInTheDocument();
        expect(screen.getByText("Find patterns in my reading")).toBeInTheDocument();
    });

    it("renders assistant message from content when parts are undefined", () => {
        (useChat as any).mockReturnValue({
            messages: [
                {
                    id: "m1",
                    role: "assistant",
                    content: "Ask page content fallback",
                },
            ],
            sendMessage: vi.fn(),
            status: "ready",
            error: null,
        });

        render(<AskClientPage initialLibrarySnapshot={defaultSnapshot} />);
        expect(screen.getByText("Ask page content fallback")).toBeInTheDocument();
    });

    it("prefers text assembled from parts over content", () => {
        (useChat as any).mockReturnValue({
            messages: [
                {
                    id: "m2",
                    role: "assistant",
                    content: "Should not be shown",
                    parts: [
                        { type: "text", text: "Ask page " },
                        { type: "text", text: "parts text" },
                    ],
                },
            ],
            sendMessage: vi.fn(),
            status: "ready",
            error: null,
        });

        render(<AskClientPage />);
        expect(screen.getByText("Ask page parts text")).toBeInTheDocument();
        expect(screen.queryByText("Should not be shown")).not.toBeInTheDocument();
    });

    it("falls back to content when parts exist but contain no text parts", () => {
        (useChat as any).mockReturnValue({
            messages: [
                {
                    id: "m3",
                    role: "assistant",
                    content: "Fallback for non-text parts",
                    parts: [{ type: "tool-invocation", toolName: "search", args: {} }],
                },
            ],
            sendMessage: vi.fn(),
            status: "ready",
            error: null,
        });

        render(<AskClientPage />);
        expect(screen.getByText("Fallback for non-text parts")).toBeInTheDocument();
    });

    it("renders follow-up actions only for the latest assistant message", () => {
        (useChat as any).mockReturnValue({
            messages: [
                {
                    id: "a1",
                    role: "assistant",
                    content: "First answer",
                },
                {
                    id: "u1",
                    role: "user",
                    content: "Tell me more",
                },
                {
                    id: "a2",
                    role: "assistant",
                    content: "Latest answer",
                },
            ],
            sendMessage: vi.fn(),
            status: "ready",
            error: null,
        });

        render(<AskClientPage />);

        expect(screen.getAllByRole("button", { name: "Which book says this?" })).toHaveLength(1);
        expect(screen.getAllByRole("button", { name: "Summarize the overlap" })).toHaveLength(1);
        expect(screen.getAllByRole("button", { name: "Show me another perspective" })).toHaveLength(1);
    });

    it("sends the canned follow-up prompt for the selected action", () => {
        const mockSendMessage = vi.fn();
        (useChat as any).mockReturnValue({
            messages: [
                {
                    id: "a2",
                    role: "assistant",
                    content: "Latest answer",
                },
            ],
            sendMessage: mockSendMessage,
            status: "ready",
            error: null,
        });

        render(<AskClientPage />);

        fireEvent.click(screen.getByRole("button", { name: "Summarize the overlap" }));

        expect(mockSendMessage).toHaveBeenCalledWith({
            text: "Summarize the shared idea across the sources behind your last answer.",
        });
    });

    it("hides follow-up actions while a response is streaming", () => {
        (useChat as any).mockReturnValue({
            messages: [
                {
                    id: "a2",
                    role: "assistant",
                    content: "Latest answer",
                },
                {
                    id: "u2",
                    role: "user",
                    content: "Keep going",
                },
            ],
            sendMessage: vi.fn(),
            status: "streaming",
            error: null,
        });

        render(<AskClientPage />);

        expect(screen.queryByRole("button", { name: "Which book says this?" })).not.toBeInTheDocument();
        expect(screen.getByText("Reading your library...")).toBeInTheDocument();
    });

    it("renders structured API error messages", () => {
        (useChat as any).mockReturnValue({
            messages: [],
            sendMessage: vi.fn(),
            status: "error",
            error: new Error(JSON.stringify({
                error: {
                    code: "INTERNAL_ERROR",
                    message: "AI service is not configured. Please contact an administrator.",
                },
            })),
        });

        render(<AskClientPage />);
        expect(screen.getByText("AI service is not configured. Please contact an administrator.")).toBeInTheDocument();
    });

    it("renders rate limit message from structured API errors", () => {
        (useChat as any).mockReturnValue({
            messages: [],
            sendMessage: vi.fn(),
            status: "error",
            error: new Error(JSON.stringify({
                error: {
                    code: "RATE_LIMITED",
                    message: "Too many requests. Please wait a moment.",
                },
            })),
        });

        render(<AskClientPage />);
        expect(screen.getByText("Too many requests. Please wait a moment.")).toBeInTheDocument();
    });
});
