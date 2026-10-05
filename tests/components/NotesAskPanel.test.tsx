import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { NotesAskPanel, type NotesChatScope } from "@/components/notes/NotesAskPanel";
import { createNotesChatScope, serializeNotesChatScope } from "@/lib/notes-chat-scope";
import { useChat } from "@ai-sdk/react";
import { vi } from "vitest";

const identity = vi.hoisted(() => ({ ownerKey: "account-a:session-a", valid: true }));
vi.mock("@/hooks/useVerifiedChatSession", () => ({
    useVerifiedChatSession: () => ({ ownerKey: identity.ownerKey, isCurrent: () => identity.valid }),
}));

vi.mock("@ai-sdk/react", () => ({
    useChat: vi.fn(),
}));

vi.mock("next/navigation", () => ({
    usePathname: () => "/notes",
    useSearchParams: () => new URLSearchParams("ask=1"),
}));

vi.mock("next/link", () => ({
    default: ({
        children,
        href,
        ...props
    }: {
        children: React.ReactNode;
        href: string;
        [key: string]: unknown;
    }) => (
        <a href={href} {...props}>{children}</a>
    ),
}));

describe("NotesAskPanel", () => {
    const setMessagesMock = vi.fn();
    const sendMessageMock = vi.fn();
    const scrollToMock = vi.fn();

    const currentScope = createNotesChatScope({ version: 1, itemType: "all", filterQuery: "goggins" }, 'search: "goggins"');
    const expectedFullScreenHref = `/ask?${new URLSearchParams({
        scope: "notes",
        returnTo: "/notes?ask=1",
        notesScope: serializeNotesChatScope(currentScope),
    }).toString()}`;

    beforeAll(() => {
        Object.defineProperty(HTMLElement.prototype, "scrollTo", {
            configurable: true,
            value: scrollToMock,
        });
    });

    beforeEach(() => {
        vi.clearAllMocks();
        window.sessionStorage.clear();
        identity.ownerKey = "account-a:session-a"; identity.valid = true;
        (useChat as any).mockReturnValue({
            messages: [],
            sendMessage: sendMessageMock,
            setMessages: setMessagesMock,
            status: "ready",
            error: null,
        });
    });

    it.each(["page", "sidebar", "default"] as const)("keeps factual feedback through delayed and empty response states in %s", (variant) => {
        vi.useFakeTimers();
        let now = 0;
        const clock = vi.spyOn(performance, "now").mockImplementation(() => now);
        const question = { id: "q", role: "user", parts: [{ type: "text", text: "Find my evidence" }] };
        const chat = { messages: [question], sendMessage: sendMessageMock, setMessages: setMessagesMock, status: "submitted", error: null } as unknown as ReturnType<typeof useChat>;
        vi.mocked(useChat).mockReturnValue(chat);
        const { rerender, unmount } = render(<NotesAskPanel variant={variant} mobile={variant === "default"} currentScope={currentScope} onClose={vi.fn()} />);
        try {
            expect(screen.getByTestId("notes-request-progress")).toHaveTextContent("Searching your saved notes…");
            act(() => { now = 8000; vi.advanceTimersByTime(8000); });
            expect(screen.getByText("8s elapsed")).toHaveAttribute("aria-hidden", "true");
            vi.mocked(useChat).mockReturnValue({ ...chat, status: "streaming", messages: [question, { id: "a", role: "assistant", parts: [] }] } as ReturnType<typeof useChat>);
            rerender(<NotesAskPanel variant={variant} mobile={variant === "default"} currentScope={currentScope} onClose={vi.fn()} />);
            expect(screen.getByTestId("notes-request-progress")).toHaveTextContent("Receiving your response…");
            expect(screen.getByTestId("notes-request-progress")).toHaveTextContent("8s elapsed");
            expect(screen.getByRole("status", { name: "Notes response status" })).not.toHaveTextContent("elapsed");
            vi.mocked(useChat).mockReturnValue({ ...chat, status: "error", error: new Error("Disconnected") });
            rerender(<NotesAskPanel variant={variant} mobile={variant === "default"} currentScope={currentScope} onClose={vi.fn()} />);
            expect(screen.queryByTestId("notes-request-progress")).not.toBeInTheDocument();
            expect(screen.getByRole("status", { name: "Notes response status" })).toHaveTextContent("Request failed.");
            vi.mocked(useChat).mockReturnValue(chat);
            rerender(<NotesAskPanel variant={variant} mobile={variant === "default"} currentScope={currentScope} onClose={vi.fn()} />);
            expect(screen.getByTestId("notes-request-progress")).toHaveTextContent("0s elapsed");
        } finally { unmount(); clock.mockRestore(); vi.useRealTimers(); }
    });

    it("keeps the failed question retryable without presenting its partial answer as complete", async () => {
        const regenerate = vi.fn();
        const setMessages = vi.fn();
        vi.mocked(useChat).mockReturnValue({
            messages: [
                { id: "question", role: "user", parts: [{ type: "text", text: "Keep my question" }] },
                { id: "partial", role: "assistant", parts: [{ type: "text", text: "Unfinished claim" }] },
            ],
            sendMessage: vi.fn(), setMessages, regenerate, status: "error", error: new Error("Disconnected"),
        } as unknown as ReturnType<typeof useChat>);
        render(<NotesAskPanel currentScope={currentScope} onClose={vi.fn()} />);
        expect(screen.getByText("Keep my question")).toBeInTheDocument();
        expect(screen.queryByText("Unfinished claim")).not.toBeInTheDocument();
        expect(screen.queryByRole("button", { name: "Pull the strongest theme" })).not.toBeInTheDocument();
        for (const button of screen.getAllByRole("button", { name: "Export chat with QR code" })) expect(button).toBeDisabled();
        fireEvent.click(screen.getByRole("button", { name: "Try again" }));
        await waitFor(() => { expect(regenerate).toHaveBeenCalledWith({ body: { scope: currentScope.scope, scopeLabel: currentScope.summary } }); });
        expect(setMessages).toHaveBeenCalledWith([expect.objectContaining({ id: "question" })]);
    });

    it.each(["page", "sidebar"] as const)("announces request boundaries without streaming tokens in %s", (variant) => {
        const chat = { messages: [], sendMessage: sendMessageMock, setMessages: setMessagesMock, status: "ready", error: null } as unknown as ReturnType<typeof useChat>;
        vi.mocked(useChat).mockReturnValue(chat);
        const { rerender } = render(<NotesAskPanel variant={variant} currentScope={currentScope} onClose={vi.fn()} />);
        const status = screen.getByRole("status", { name: "Notes response status" });
        expect(status).toBeEmptyDOMElement();
        const composer = screen.getByRole("textbox");
        composer.focus();
        vi.mocked(useChat).mockReturnValue({ ...chat, status: "streaming", messages: [{ id: "answer", role: "assistant", parts: [{ type: "text", text: "Partial words" }] }] } as ReturnType<typeof useChat>);
        rerender(<NotesAskPanel variant={variant} currentScope={currentScope} onClose={vi.fn()} />);
        expect(status).toHaveTextContent("Receiving your response…");
        expect(status).not.toHaveTextContent("Partial words");
        vi.mocked(useChat).mockReturnValue({ ...chat, messages: [{ id: "answer", role: "assistant", parts: [{ type: "text", text: "Verified words" }] }] } as ReturnType<typeof useChat>);
        rerender(<NotesAskPanel variant={variant} currentScope={currentScope} onClose={vi.fn()} />);
        expect(status).toHaveTextContent("Response ready.");
        expect(status).toHaveAttribute("aria-atomic", "true");
        expect(screen.getByRole("region", { name: "Notes conversation" })).toHaveTextContent("Verified words");
        expect(composer).toHaveFocus();
        vi.mocked(useChat).mockReturnValue({ ...chat, status: "error", error: new Error("Disconnected") });
        rerender(<NotesAskPanel variant={variant} currentScope={currentScope} onClose={vi.fn()} />);
        expect(status).toHaveTextContent("Request failed.");
        expect(status).not.toHaveTextContent("Response ready.");
    });

    it("renders exact quotations literally and keeps validated citation links separate", () => {
        const text = "**literal** [not a link](https://example.invalid) <script>stored</script>";
        vi.mocked(useChat).mockReturnValue({ messages: [{ id: "quoted", role: "assistant", parts: [
            { type: "text", text }, { type: "data-exact-quotation", data: true },
            { type: "data-citations", data: [{ label: "Your note", href: "/evidence#opaque" }] },
        ] }], sendMessage: sendMessageMock, setMessages: setMessagesMock, status: "ready", error: null } as unknown as ReturnType<typeof useChat>);
        render(<NotesAskPanel currentScope={currentScope} onClose={vi.fn()} />);
        expect(screen.getByText(text)).toBeInTheDocument();
        expect(screen.queryByRole("link", { name: "not a link" })).not.toBeInTheDocument();
        expect(screen.getByRole("link", { name: /Your note.*opens in a new tab/ })).toHaveAttribute("href", "/evidence#opaque");
    });

    it("renders starter prompts and sends them with the declarative server scope", async () => {
        render(<NotesAskPanel currentScope={currentScope} onClose={vi.fn()} />);

        expect(screen.getByText("Ask These Notes")).toBeInTheDocument();
        expect(screen.getAllByText("Matching saved captures").length).toBeGreaterThan(0);

        fireEvent.click(screen.getByRole("button", { name: "What patterns show up across these notes?" }));

        await waitFor(() => {
            expect(sendMessageMock).toHaveBeenCalledWith(
                { text: "What patterns show up across these notes?" },
                {
                    body: {
                        scope: currentScope.scope,
                        scopeLabel: 'search: "goggins"',
                    },
                }
            );
        });
    });

    it("uses the author-chat shell pattern for the page variant while keeping scope context", () => {
        const pageScope: NotesChatScope = {
            ...currentScope,

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
        expect(screen.getAllByText("Matching saved captures").length).toBeGreaterThan(0);
        expect(screen.queryByText(/Using .* most recent/)).not.toBeInTheDocument();
        expect(screen.getByText('search: "goggins"')).toBeInTheDocument();
        expect(screen.getByPlaceholderText("Ask about saved captures matching this scope…")).toBeInTheDocument();
        expect(
            screen.getByText("Notes-scoped assistant · Grounded only in the notes currently in scope.")
        ).toBeInTheDocument();
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
                    scope: { version: 1, itemType: "highlight" },
                    summary: "highlights only",
                    signature: "scope-b",
                }}
                onClose={vi.fn()}
            />
        );

        expect(screen.getAllByText(/filters changed/i).length).toBeGreaterThan(0);

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

        expect(screen.getByRole("link", { name: /open ask these notes in full screen/i })).toHaveAttribute(
            "href",
            expectedFullScreenHref
        );
        expect(screen.queryByLabelText(/close notes ai panel/i)).not.toBeInTheDocument();
        expect(screen.getAllByText("Matching saved captures")).toHaveLength(1);
        expect(screen.getByText("Grounded only in the notes currently in scope.")).toBeInTheDocument();
        expect(screen.queryByText(/matching notes/i)).not.toBeInTheDocument();
    });
});

it("allows a reflection-only question without relying on loaded highlight IDs", async () => {
    const send = vi.fn();
    vi.mocked(useChat).mockReturnValue({ messages: [], sendMessage: send, setMessages: vi.fn(), status: "ready", error: undefined } as unknown as ReturnType<typeof useChat>);
    const scope = createNotesChatScope({ version: 1, itemType: "reflection", filterQuery: "focus" });
    render(<NotesAskPanel currentScope={scope} onClose={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "What patterns show up across these notes?" }));
    await waitFor(() => expect(send).toHaveBeenCalledWith(expect.anything(), { body: { scope: scope.scope, scopeLabel: scope.summary } }));
});
it("stops an active transport when its verified account/session is replaced", () => {
    const stop = vi.fn();
    vi.mocked(useChat).mockReturnValue({ messages: [], sendMessage: vi.fn(), setMessages: vi.fn(), stop, status: "streaming", error: undefined } as unknown as ReturnType<typeof useChat>);
    const scope = createNotesChatScope({ version: 1, itemType: "all" });
    const { rerender } = render(<NotesAskPanel currentScope={scope} onClose={vi.fn()} />);
    identity.ownerKey = "account-b:session-b";
    rerender(<NotesAskPanel currentScope={scope} onClose={vi.fn()} />);
    expect(stop).toHaveBeenCalledOnce();
});
it('renders invalid URL filters safely and cannot submit a broadened question', () => {
    const send = vi.fn();
    vi.mocked(useChat).mockReturnValue({ messages: [], sendMessage: send, setMessages: vi.fn(), status: 'ready', error: undefined } as unknown as ReturnType<typeof useChat>);
    const scope = createNotesChatScope({ version: 1, itemType: 'all', contentItemId: 'invalid-url-source' });
    render(<NotesAskPanel currentScope={scope} onClose={vi.fn()} />);
    expect(screen.getByRole('textbox', { name: 'Ask a question about the notes in view' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'What patterns show up across these notes?' }));
    expect(send).not.toHaveBeenCalled();
    expect(screen.getAllByText('Adjust Notes filters').length).toBeGreaterThan(0);
});
