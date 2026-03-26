import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { NotesAskPanel, type NotesChatScope } from "@/components/notes/NotesAskPanel";
import { serializeNotesChatScope } from "@/lib/notes-chat-scope";
import { useChat } from "@ai-sdk/react";
import { vi } from "vitest";

const { pathnameState, searchParamsState } = vi.hoisted(() => ({
    pathnameState: { value: "/notes" },
    searchParamsState: { value: new URLSearchParams("ask=1&q=goggins&type=note") },
}));

vi.mock("@ai-sdk/react", () => ({
    useChat: vi.fn(),
}));

vi.mock("next/navigation", () => ({
    usePathname: () => pathnameState.value,
    useSearchParams: () => searchParamsState.value,
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
    const expectedFullScreenHref = `/ask?${new URLSearchParams({
        scope: "notes",
        returnTo: "/notes?ask=1&q=goggins&type=note",
        notesScope: serializeNotesChatScope(currentScope),
    }).toString()}`;

    beforeAll(() => {
        Object.defineProperty(HTMLElement.prototype, "scrollIntoView", {
            configurable: true,
            value: scrollIntoViewMock,
        });
    });

    beforeEach(() => {
        vi.clearAllMocks();
        pathnameState.value = "/notes";
        searchParamsState.value = new URLSearchParams("ask=1&q=goggins&type=note");
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
        expect(screen.getAllByText("2 notes in scope")).toHaveLength(2);
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

    it("uses the author-chat shell pattern for the page variant while keeping scope context", () => {
        const pageScope: NotesChatScope = {
            ...currentScope,
            totalMatches: 6,
        };

        render(
            <NotesAskPanel
                currentScope={pageScope}
                onClose={vi.fn()}
                variant="page"
            />
        );

        expect(screen.queryByText("Ask These Notes")).not.toBeInTheDocument();
        expect(screen.getByText("Explore this note set")).toBeInTheDocument();
        expect(
            screen.getByText("Use the notes currently in scope to surface patterns, compare themes, retrieve supporting evidence, and spot tensions or contradictions.")
        ).toBeInTheDocument();
        expect(screen.getByText("Good places to start")).toBeInTheDocument();
        expect(screen.getAllByText("2 notes in scope")).toHaveLength(2);
        expect(screen.getAllByText("Using 2 most recent")).toHaveLength(2);
        expect(screen.getByText('search: "goggins"')).toBeInTheDocument();
        expect(screen.getByPlaceholderText("Ask about the notes in this scope...")).toBeInTheDocument();
        expect(
            screen.getByText("Notes-scoped assistant · Grounded only in the notes currently in scope.")
        ).toBeInTheDocument();
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

        expect(screen.getAllByText(/filters changed/i)).toHaveLength(2);

        fireEvent.click(screen.getAllByRole("button", { name: /use current filters/i })[0]);

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
            expectedFullScreenHref
        );
        expect(screen.queryByLabelText(/close notes ai panel/i)).not.toBeInTheDocument();
        expect(screen.getAllByText("2 notes in scope")).toHaveLength(1);
        expect(screen.getByText("Grounded only in the notes currently in scope.")).toBeInTheDocument();
        expect(screen.queryByText(/matching notes/i)).not.toBeInTheDocument();
    });

    it("keeps the active chat scope when opening full-screen after filters change", () => {
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

        searchParamsState.value = new URLSearchParams("ask=1&color=blue");

        const nextScope: NotesChatScope = {
            highlightIds: ["highlight-3"],
            noteCount: 1,
            totalMatches: 1,
            summary: "blue highlights",
            signature: "scope-b",
        };

        rerender(<NotesAskPanel currentScope={nextScope} onClose={vi.fn()} />);

        const href = screen.getAllByRole("link", { name: /full ask/i })[0].getAttribute("href");
        const expectedHref = `/ask?${new URLSearchParams({
            scope: "notes",
            returnTo: "/notes?ask=1&color=blue",
            notesScope: serializeNotesChatScope(currentScope),
        }).toString()}`;

        expect(href).toBe(expectedHref);
    });
});
