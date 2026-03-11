import { render, screen, fireEvent } from "@testing-library/react";
import { AskClientPage } from "@/app/(public)/ask/client-page";
import { useChat } from "@ai-sdk/react";
import { vi } from "vitest";

vi.mock("@ai-sdk/react", () => ({
    useChat: vi.fn(),
}));

vi.mock("next/link", () => ({
    default: ({ children, href }: { children: React.ReactNode; href: string }) => (
        <a href={href}>{children}</a>
    ),
}));

describe("AskClientPage", () => {
    beforeAll(() => {
        Object.defineProperty(HTMLElement.prototype, "scrollIntoView", {
            configurable: true,
            value: vi.fn(),
        });
    });

    beforeEach(() => {
        vi.clearAllMocks();
        (useChat as any).mockReturnValue({
            messages: [],
            sendMessage: vi.fn(),
            status: "ready",
            error: null,
        });
    });

    it("renders the empty state and starter prompts", () => {
        render(<AskClientPage />);

        expect(screen.getByText("Ask My Library")).toBeInTheDocument();
        expect(screen.getByText("Search the ideas you've saved")).toBeInTheDocument();
        expect(screen.getByText("Good places to start")).toBeInTheDocument();
        expect(screen.getByRole("button", { name: "What themes show up across my saved books?" })).toBeInTheDocument();
        expect(screen.getByRole("button", { name: "Summarize the most actionable ideas in my library." })).toBeInTheDocument();
        expect(screen.getByRole("button", { name: "Which book in my library is most relevant to this topic?" })).toBeInTheDocument();
        expect(screen.getByRole("button", { name: "Compare different perspectives from my saved books." })).toBeInTheDocument();
    });

    it("sends the selected starter prompt", () => {
        const mockSendMessage = vi.fn();
        (useChat as any).mockReturnValue({
            messages: [],
            sendMessage: mockSendMessage,
            status: "ready",
            error: null,
        });

        render(<AskClientPage />);

        fireEvent.click(screen.getByRole("button", { name: "What themes show up across my saved books?" }));

        expect(mockSendMessage).toHaveBeenCalledWith({ text: "What themes show up across my saved books?" });
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

        render(<AskClientPage />);

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

        render(<AskClientPage />);
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
