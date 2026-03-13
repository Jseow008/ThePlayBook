import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { NotesAskPanel, type NotesChatScope } from "@/components/notes/NotesAskPanel";
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

describe("NotesAskPanel", () => {
    const setMessagesMock = vi.fn();
    const sendMessageMock = vi.fn();
    const scrollIntoViewMock = vi.fn();

    const currentScope: NotesChatScope = {
        highlightIds: ["highlight-1", "highlight-2"],
        noteCount: 2,
        totalMatches: 2,
        summary: 'search: "goggins"',
        signature: "scope-a",
    };

    beforeAll(() => {
        Object.defineProperty(HTMLElement.prototype, "scrollIntoView", {
            configurable: true,
            value: scrollIntoViewMock,
        });
    });

    beforeEach(() => {
        vi.clearAllMocks();
        (useChat as any).mockReturnValue({
            messages: [],
            sendMessage: sendMessageMock,
            setMessages: setMessagesMock,
            status: "ready",
            error: null,
        });
    });

    it("renders starter prompts and sends them with the scoped note ids", async () => {
        render(<NotesAskPanel currentScope={currentScope} onClose={vi.fn()} />);

        expect(screen.getByText("Ask These Notes")).toBeInTheDocument();
        expect(screen.getByText("2 notes in scope")).toBeInTheDocument();
        expect(scrollIntoViewMock).not.toHaveBeenCalled();

        fireEvent.click(screen.getByRole("button", { name: "What patterns show up across these notes?" }));

        await waitFor(() => {
            expect(sendMessageMock).toHaveBeenCalledWith(
                { text: "What patterns show up across these notes?" },
                {
                    body: {
                        highlightIds: ["highlight-1", "highlight-2"],
                        scopeLabel: 'search: "goggins"',
                    },
                }
            );
        });
    });

    it("auto-scrolls only after real chat activity appears", () => {
        const { rerender } = render(<NotesAskPanel currentScope={currentScope} onClose={vi.fn()} />);

        expect(scrollIntoViewMock).not.toHaveBeenCalled();

        (useChat as any).mockReturnValue({
            messages: [
                {
                    id: "u1",
                    role: "user",
                    content: "Summarize these notes",
                },
            ],
            sendMessage: sendMessageMock,
            setMessages: setMessagesMock,
            status: "submitted",
            error: null,
        });

        rerender(<NotesAskPanel currentScope={currentScope} onClose={vi.fn()} />);

        expect(scrollIntoViewMock).toHaveBeenCalledWith({ behavior: "smooth", block: "end" });
    });

    it("shows a scope changed banner after filters move and resets to the new scope", () => {
        (useChat as any).mockReturnValue({
            messages: [
                {
                    id: "u1",
                    role: "user",
                    content: "Summarize these notes",
                },
            ],
            sendMessage: sendMessageMock,
            setMessages: setMessagesMock,
            status: "ready",
            error: null,
        });

        const { rerender } = render(<NotesAskPanel currentScope={currentScope} onClose={vi.fn()} />);

        rerender(
            <NotesAskPanel
                currentScope={{
                    ...currentScope,
                    highlightIds: ["highlight-3"],
                    noteCount: 1,
                    totalMatches: 1,
                    summary: "highlights only",
                    signature: "scope-b",
                }}
                onClose={vi.fn()}
            />
        );

        expect(screen.getByText(/filters changed/i)).toBeInTheDocument();

        fireEvent.click(screen.getByRole("button", { name: /use current filters/i }));

        expect(setMessagesMock).toHaveBeenCalledWith([]);
    });

    it("uses the desktop sidebar copy without rendering a local close button", () => {
        render(
            <NotesAskPanel
                currentScope={currentScope}
                onClose={vi.fn()}
                variant="sidebar"
            />
        );

        expect(screen.getByRole("link", { name: /full screen/i })).toHaveAttribute(
            "href",
            "/ask?scope=notes&returnTo=%2Fnotes%3Fask%3D1"
        );
        expect(screen.queryByLabelText(/close notes ai panel/i)).not.toBeInTheDocument();
        expect(screen.getAllByText("2 notes in scope")).toHaveLength(1);
        expect(screen.queryByText(/matching notes/i)).not.toBeInTheDocument();
    });
});
