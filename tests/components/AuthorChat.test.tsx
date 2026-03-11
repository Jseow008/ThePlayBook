import { render, screen, fireEvent } from "@testing-library/react";
import { AuthorChat } from "@/components/reader/AuthorChat";
import { useChat } from "@ai-sdk/react";
import { vi } from "vitest";

vi.mock("@ai-sdk/react", () => ({
    useChat: vi.fn(),
}));

describe("AuthorChat", () => {
    const mockOnClose = vi.fn();
    const defaultProps = {
        contentId: "123",
        authorName: "Test Author",
        bookTitle: "Test Book",
        onClose: mockOnClose,
    };

    beforeEach(() => {
        vi.clearAllMocks();
        (useChat as any).mockReturnValue({
            messages: [],
            sendMessage: vi.fn(),
            status: "ready",
            error: null,
        });
    });

    it("renders the empty state with author details and starter prompts", () => {
        render(<AuthorChat {...defaultProps} />);

        expect(screen.getByText("Test Author")).toBeInTheDocument();
        expect(screen.getAllByText("Test Book").length).toBeGreaterThan(0);
        expect(screen.getByText("Keep the conversation going")).toBeInTheDocument();
        expect(screen.getByText("Good places to start")).toBeInTheDocument();
        expect(screen.getByRole("button", { name: "What's the core argument I should walk away with?" })).toBeInTheDocument();
        expect(screen.getByRole("button", { name: "What would a skeptic say about this?" })).toBeInTheDocument();
        expect(screen.getByRole("button", { name: "How would you apply this in real life?" })).toBeInTheDocument();
        expect(screen.getByRole("button", { name: "Which idea in this book matters most?" })).toBeInTheDocument();
    });

    it("calls onClose when close button is clicked", () => {
        render(<AuthorChat {...defaultProps} />);
        const closeButton = screen.getByRole("button", { name: /close chat/i });
        fireEvent.click(closeButton);
        expect(mockOnClose).toHaveBeenCalledTimes(1);
    });

    it("can submit a message", async () => {
        const mockSendMessage = vi.fn();
        (useChat as any).mockReturnValue({
            messages: [],
            sendMessage: mockSendMessage,
            status: "ready",
            error: null,
        });

        render(<AuthorChat {...defaultProps} />);

        const input = screen.getByRole("textbox", { name: /Ask Test Author a question/i });
        fireEvent.change(input, { target: { value: "Hello there" } });

        const form = input.closest("form");
        expect(form).toBeInTheDocument();

        fireEvent.submit(form!);

        expect(mockSendMessage).toHaveBeenCalledWith({ text: "Hello there" });
    });

    it("sends the selected starter prompt", () => {
        const mockSendMessage = vi.fn();
        (useChat as any).mockReturnValue({
            messages: [],
            sendMessage: mockSendMessage,
            status: "ready",
            error: null,
        });

        render(<AuthorChat {...defaultProps} />);

        fireEvent.click(screen.getByRole("button", { name: "What would a skeptic say about this?" }));

        expect(mockSendMessage).toHaveBeenCalledWith({ text: "What would a skeptic say about this?" });
    });

    it("shows the transcript after chat starts instead of the intro panel", () => {
        (useChat as any).mockReturnValue({
            messages: [
                {
                    id: "u1",
                    role: "user",
                    content: "Tell me the main idea",
                },
            ],
            sendMessage: vi.fn(),
            status: "ready",
            error: null,
        });

        render(<AuthorChat {...defaultProps} />);

        expect(screen.queryByText("Keep the conversation going")).not.toBeInTheDocument();
        expect(screen.getByText("Tell me the main idea")).toBeInTheDocument();
    });

    it("renders assistant message from content when parts are undefined", () => {
        (useChat as any).mockReturnValue({
            messages: [
                {
                    id: "m1",
                    role: "assistant",
                    content: "Message from content fallback",
                },
            ],
            sendMessage: vi.fn(),
            status: "ready",
            error: null,
        });

        render(<AuthorChat {...defaultProps} />);
        expect(screen.getByText("Message from content fallback")).toBeInTheDocument();
    });

    it("prefers text assembled from parts over content", () => {
        (useChat as any).mockReturnValue({
            messages: [
                {
                    id: "m2",
                    role: "assistant",
                    content: "Should not be shown",
                    parts: [
                        { type: "text", text: "Message from " },
                        { type: "text", text: "parts" },
                    ],
                },
            ],
            sendMessage: vi.fn(),
            status: "ready",
            error: null,
        });

        render(<AuthorChat {...defaultProps} />);
        expect(screen.getByText("Message from parts")).toBeInTheDocument();
        expect(screen.queryByText("Should not be shown")).not.toBeInTheDocument();
    });

    it("falls back to content when parts exist but contain no text parts", () => {
        (useChat as any).mockReturnValue({
            messages: [
                {
                    id: "m3",
                    role: "assistant",
                    content: "Fallback when parts has no text",
                    parts: [{ type: "tool-invocation", toolName: "search", args: {} }],
                },
            ],
            sendMessage: vi.fn(),
            status: "ready",
            error: null,
        });

        render(<AuthorChat {...defaultProps} />);
        expect(screen.getByText("Fallback when parts has no text")).toBeInTheDocument();
    });

    it("renders follow-up actions only for the latest assistant message", () => {
        (useChat as any).mockReturnValue({
            messages: [
                {
                    id: "a1",
                    role: "assistant",
                    content: "First assistant answer",
                },
                {
                    id: "u1",
                    role: "user",
                    content: "Tell me more",
                },
                {
                    id: "a2",
                    role: "assistant",
                    content: "Latest assistant answer",
                },
            ],
            sendMessage: vi.fn(),
            status: "ready",
            error: null,
        });

        render(<AuthorChat {...defaultProps} />);

        expect(screen.getAllByRole("button", { name: "Go deeper" })).toHaveLength(1);
        expect(screen.getAllByRole("button", { name: "Give me an example" })).toHaveLength(1);
        expect(screen.getAllByRole("button", { name: "What's the counterargument?" })).toHaveLength(1);
    });

    it("sends the canned follow-up prompt for the selected action", () => {
        const mockSendMessage = vi.fn();
        (useChat as any).mockReturnValue({
            messages: [
                {
                    id: "a2",
                    role: "assistant",
                    content: "Latest assistant answer",
                },
            ],
            sendMessage: mockSendMessage,
            status: "ready",
            error: null,
        });

        render(<AuthorChat {...defaultProps} />);

        fireEvent.click(screen.getByRole("button", { name: "Give me an example" }));

        expect(mockSendMessage).toHaveBeenCalledWith({
            text: "Give me a concrete real-world example of your last point.",
        });
    });

    it("hides follow-up actions while a response is streaming", () => {
        (useChat as any).mockReturnValue({
            messages: [
                {
                    id: "a2",
                    role: "assistant",
                    content: "Latest assistant answer",
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

        render(<AuthorChat {...defaultProps} />);

        expect(screen.queryByRole("button", { name: "Go deeper" })).not.toBeInTheDocument();
        expect(screen.getByText("Thinking...")).toBeInTheDocument();
    });

    it("displays error state when error occurs", () => {
        (useChat as any).mockReturnValue({
            messages: [],
            sendMessage: vi.fn(),
            status: "error",
            error: new Error("Failed to chat"),
        });

        render(<AuthorChat {...defaultProps} />);
        expect(screen.getByText(/Something went wrong/i)).toBeInTheDocument();
    });

    it("renders structured API error messages", () => {
        (useChat as any).mockReturnValue({
            messages: [],
            sendMessage: vi.fn(),
            status: "error",
            error: new Error(JSON.stringify({
                error: {
                    code: "INTERNAL_ERROR",
                    message: "AI service is not configured.",
                },
            })),
        });

        render(<AuthorChat {...defaultProps} />);
        expect(screen.getByText("AI service is not configured.")).toBeInTheDocument();
    });

    it("renders rate limit message from structured API errors", () => {
        (useChat as any).mockReturnValue({
            messages: [],
            sendMessage: vi.fn(),
            status: "error",
            error: new Error(JSON.stringify({
                error: {
                    code: "RATE_LIMITED",
                    message: "Too many requests. Please wait 20 seconds and try again.",
                },
            })),
        });

        render(<AuthorChat {...defaultProps} />);
        expect(screen.getByText("Too many requests. Please wait 20 seconds and try again.")).toBeInTheDocument();
    });
});
