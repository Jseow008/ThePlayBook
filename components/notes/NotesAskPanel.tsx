"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import ReactMarkdown from "react-markdown";
import { useChat } from "@ai-sdk/react";
import { TextStreamChatTransport, type UIMessage } from "ai";
import {
    ArrowRight,
    BookOpen,
    Bot,
    BotMessageSquare,
    Expand,
    Loader2,
    Plus,
    RefreshCw,
    Send,
    User,
    X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { serializeNotesChatScope, type NotesChatScopePayload } from "@/lib/notes-chat-scope";
import {
    clearNotesChatSession,
    readNotesChatSession,
    writeNotesChatSession,
} from "@/lib/notes-chat-session";

const chatTransport = new TextStreamChatTransport({ api: "/api/chat/notes" });

const FALLBACK_CHAT_ERROR = "Something went wrong. Please try asking again.";

const STARTER_PROMPTS = [
    "What patterns show up across these notes?",
    "Summarize the key ideas in this note set.",
    "Which notes point to the same theme?",
    "What tensions or contradictions appear here?",
] as const;

const FOLLOW_UP_ACTIONS = [
    {
        label: "Pull the strongest theme",
        prompt: "Pull out the single strongest theme across these notes and explain why it matters.",
    },
    {
        label: "Show supporting notes",
        prompt: "Which specific notes best support your last answer? Cite them clearly.",
    },
    {
        label: "Find what's missing",
        prompt: "What's missing or underexplored in these notes based on the current theme?",
    },
] as const;

const NOTES_RETURN_TARGET = "/notes?ask=1";
export type NotesChatScope = NotesChatScopePayload;

interface NotesAskPanelProps {
    currentScope: NotesChatScope;
    onClose: () => void;
    mobile?: boolean;
    variant?: "default" | "sidebar" | "page";
}

function getDisplayErrorMessage(error: unknown): string {
    if (!(error instanceof Error) || !error.message) {
        return FALLBACK_CHAT_ERROR;
    }

    try {
        const parsed = JSON.parse(error.message) as {
            error?: {
                code?: string;
                message?: string;
            };
        };

        if (parsed.error?.code === "RATE_LIMITED") {
            return parsed.error.message ?? "You're sending messages too quickly. Please wait a moment and try again.";
        }

        if (parsed.error?.message) {
            return parsed.error.message;
        }
    } catch {
        // Non-JSON transport errors fall back below.
    }

    return FALLBACK_CHAT_ERROR;
}

function getScopeTokens(scopeSummary: string): string[] {
    const trimmed = scopeSummary.trim();

    if (!trimmed || trimmed === "All content") {
        return ["All content"];
    }

    return trimmed
        .split(" • ")
        .map((part) => part.trim())
        .filter(Boolean);
}

function getNotesLabel(count: number): string {
    return `${count} ${count === 1 ? "note" : "notes"} in scope`;
}

function ScopeOverview({
    scope,
    compact = false,
    className,
}: {
    scope: NotesChatScope;
    compact?: boolean;
    className?: string;
}) {
    const scopeTokens = getScopeTokens(scope.summary);
    const isTruncated = scope.totalMatches > scope.noteCount;

    return (
        <section
            className={cn(
                "rounded-[20px] border border-border/55 bg-background/55 px-4 py-3 shadow-[0_10px_30px_-24px_rgba(0,0,0,0.75)]",
                compact && "rounded-2xl px-3.5 py-3",
                className
            )}
        >
            <div className="flex flex-wrap items-center gap-2">
                <p className="text-[0.68rem] font-semibold uppercase tracking-[0.18em] text-muted-foreground/85">
                    Current scope
                </p>
                <span className="rounded-full border border-border/70 bg-card/60 px-2.5 py-1 text-[0.68rem] font-medium text-foreground/88">
                    {getNotesLabel(scope.noteCount)}
                </span>
                {scopeTokens.map((token) => (
                    <span
                        key={token}
                        className="rounded-full border border-border/60 bg-card/45 px-2.5 py-1 text-[0.68rem] text-foreground/85"
                    >
                        {token}
                    </span>
                ))}
                {isTruncated && (
                    <span className="rounded-full border border-primary/20 bg-primary/10 px-2.5 py-1 text-[0.68rem] font-medium text-primary">
                        Using {scope.noteCount} most recent
                    </span>
                )}
            </div>
        </section>
    );
}

function ScopeChangedBanner({
    onSync,
    compact = false,
}: {
    onSync: () => void;
    compact?: boolean;
}) {
    return (
        <div
            className={cn(
                "border border-primary/25 bg-[linear-gradient(180deg,rgba(255,255,255,0.04),rgba(255,255,255,0.015)),linear-gradient(90deg,rgba(255,255,255,0.02),rgba(255,255,255,0))] px-4 py-3 shadow-[0_16px_40px_-28px_rgba(255,255,255,0.18)]",
                compact ? "rounded-2xl" : "rounded-none"
            )}
        >
            <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                    <p className="text-[0.72rem] font-semibold uppercase tracking-[0.16em] text-primary/90">
                        Scope changed
                    </p>
                    <p className="mt-1 text-xs leading-relaxed text-foreground/78">
                        Your filters changed. This chat is still grounded in the earlier notes snapshot.
                    </p>
                </div>

                <button
                    type="button"
                    onClick={onSync}
                    className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-primary/25 bg-primary/10 px-3 py-1 text-[0.72rem] font-medium text-primary transition-colors hover:bg-primary/15"
                >
                    <RefreshCw className="size-3" />
                    Use current filters
                </button>
            </div>
        </div>
    );
}

export function NotesAskPanel({
    currentScope,
    onClose,
    mobile = false,
    variant = "default",
}: NotesAskPanelProps) {
    const pathname = usePathname();
    const searchParams = useSearchParams();
    const [input, setInput] = useState("");
    const [showAllStarterPrompts, setShowAllStarterPrompts] = useState(false);
    const [activeScope, setActiveScope] = useState<NotesChatScope>(currentScope);
    const messagesEndRef = useRef<HTMLDivElement>(null);
    const textareaRef = useRef<HTMLTextAreaElement>(null);
    const hasMountedRef = useRef(false);
    const hasHydratedSessionRef = useRef(false);
    const previousMessageCountRef = useRef(0);
    const previousStatusRef = useRef<string | null>(null);

    const {
        messages,
        sendMessage,
        setMessages,
        status,
        error,
    } = useChat<UIMessage>({
        transport: chatTransport,
    });

    useEffect(() => {
        if (messages.length === 0 && hasHydratedSessionRef.current) {
            setActiveScope(currentScope);
        }
    }, [currentScope, messages.length]);

    useEffect(() => {
        if (hasHydratedSessionRef.current) {
            return;
        }

        const restoredSession = readNotesChatSession(currentScope.signature);
        if (restoredSession) {
            setActiveScope(restoredSession.activeScope);
            setMessages(restoredSession.messages);
        } else {
            setActiveScope(currentScope);
        }

        hasHydratedSessionRef.current = true;
    }, [currentScope, setMessages]);

    useEffect(() => {
        if (!(variant === "sidebar" && !mobile) || messages.length > 0) {
            setShowAllStarterPrompts(false);
        }
    }, [activeScope.signature, messages.length, mobile, variant]);

    useEffect(() => {
        if (!hasHydratedSessionRef.current) {
            return;
        }

        const persistenceKeys = [activeScope.signature, currentScope.signature];

        if (messages.length === 0) {
            clearNotesChatSession(currentScope.signature);
            return;
        }

        writeNotesChatSession(persistenceKeys, {
            activeScope,
            messages,
            updatedAt: Date.now(),
        });
    }, [activeScope, currentScope.signature, messages]);

    useEffect(() => {
        const previousMessageCount = previousMessageCountRef.current;
        const previousStatus = previousStatusRef.current;
        const hasMessages = messages.length > 0;
        const hasNewMessage = messages.length > previousMessageCount;
        const isStreamingUpdate =
            hasMessages
            && status === "streaming"
            && previousStatus !== "streaming";

        if (hasMountedRef.current && (hasNewMessage || isStreamingUpdate)) {
            messagesEndRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
        }

        hasMountedRef.current = true;
        previousMessageCountRef.current = messages.length;
        previousStatusRef.current = status;
    }, [messages.length, status]);

    useEffect(() => {
        const textarea = textareaRef.current;
        if (textarea) {
            textarea.style.height = "auto";
            textarea.style.height = `${Math.min(textarea.scrollHeight, 160)}px`;
        }
    }, [input]);

    const isStreaming = status === "streaming" || status === "submitted";
    const displayErrorMessage = getDisplayErrorMessage(error);
    const isEmptyState = messages.length === 0;
    const hasScopeChanged = messages.length > 0 && activeScope.signature !== currentScope.signature;
    const isSidebar = variant === "sidebar" && !mobile;
    const isPage = variant === "page";
    const notesLabel = getNotesLabel(activeScope.noteCount);
    const composerPlaceholder = activeScope.highlightIds.length === 0
        ? "No notes in scope. Adjust your filters first."
        : `Ask about the ${activeScope.noteCount === 1 ? "note" : "notes"} in this scope...`;
    const visibleStarterPrompts = isSidebar && !showAllStarterPrompts
        ? STARTER_PROMPTS.slice(0, 2)
        : STARTER_PROMPTS;
    const returnTarget = (() => {
        const resolvedPathname = pathname || "/notes";
        const params = new URLSearchParams(searchParams?.toString() ?? "");

        if (resolvedPathname === "/notes") {
            params.set("ask", "1");
        }

        const query = params.toString();
        return query ? `${resolvedPathname}?${query}` : resolvedPathname;
    })();
    const fullScreenHref = (() => {
        const params = new URLSearchParams({
            scope: "notes",
            returnTo: returnTarget || NOTES_RETURN_TARGET,
            notesScope: serializeNotesChatScope(activeScope),
        });
        return `/ask?${params.toString()}`;
    })();
    const headerActionClassName = cn(
        "inline-flex items-center rounded-full border border-border/70 bg-background/45 px-3.5 py-2 text-xs font-medium text-foreground/82 shadow-[0_1px_0_rgba(255,255,255,0.02)] transition-all hover:border-border hover:bg-card/75 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 disabled:cursor-not-allowed disabled:opacity-50",
        isSidebar && "px-3.5 py-2 text-[0.72rem]"
    );
    const sidebarUtilityActionClassName = "hidden sm:inline-flex size-10 items-center justify-center rounded-full border border-border/70 bg-background/45 text-foreground/82 shadow-[0_1px_0_rgba(255,255,255,0.02)] transition-all hover:border-border hover:bg-card/75 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40";
    const newChatActionClassName = cn(
        "inline-flex items-center gap-1.5 rounded-full border border-primary/30 bg-primary/12 px-3.5 py-2 text-xs font-semibold text-primary shadow-[0_10px_24px_-18px_rgba(255,255,255,0.3)] transition-all hover:border-primary/45 hover:bg-primary/18 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/45 disabled:cursor-not-allowed disabled:opacity-50",
        isSidebar && "px-3 py-1.5 text-[0.72rem]"
    );

    const sendPrompt = async (text: string) => {
        const trimmed = text.trim();
        if (!trimmed || isStreaming || activeScope.highlightIds.length === 0) {
            return;
        }

        setInput("");
        if (textareaRef.current) {
            textareaRef.current.style.height = "auto";
        }

        await sendMessage(
            { text: trimmed },
            {
                body: {
                    highlightIds: activeScope.highlightIds,
                    scopeLabel: activeScope.summary,
                },
            }
        );
    };

    const onSubmit = async (event?: FormEvent) => {
        event?.preventDefault();
        await sendPrompt(input);
    };

    const syncToCurrentScope = () => {
        setActiveScope(currentScope);
        setMessages([]);
    };

    const startNewChat = () => {
        clearNotesChatSession([activeScope.signature, currentScope.signature]);
        setInput("");
        setShowAllStarterPrompts(false);
        setActiveScope(currentScope);
        setMessages([]);

        if (textareaRef.current) {
            textareaRef.current.style.height = "auto";
        }
    };

    const getMessageText = (message: (typeof messages)[number]): string => {
        const partsText = message.parts
            ?.filter((part): part is { type: "text"; text: string } =>
                part.type === "text" && typeof (part as { text?: unknown }).text === "string"
            )
            .map((part) => part.text)
            .join("") || "";

        if (partsText) {
            return partsText;
        }

        const maybeContent = (message as unknown as { content?: unknown }).content;
        return typeof maybeContent === "string" ? maybeContent : "";
    };

    const displayMessages: Array<{ id: string; role: string; content: string }> = messages.map((message) => ({
        id: message.id,
        role: message.role,
        content: getMessageText(message),
    }));

    const latestAssistantMessageId = [...displayMessages]
        .reverse()
        .find((message) => message.role === "assistant")?.id;

    if (isPage) {
        return (
            <section className="flex h-full min-h-0 flex-1 flex-col">
                <div className="flex min-h-0 flex-1 flex-col rounded-[28px] border border-border/50 bg-card/35 shadow-[0_0_0_1px_rgba(255,255,255,0.02)] backdrop-blur-sm">
                    {hasScopeChanged && (
                        <div className="border-b border-border/40 px-4 pt-4 sm:px-6">
                            <div className="mx-auto w-full max-w-4xl pb-4">
                                <ScopeChangedBanner onSync={syncToCurrentScope} compact />
                            </div>
                        </div>
                    )}

                    <div className="mx-auto flex min-h-0 w-full max-w-4xl flex-1 flex-col px-4 py-6 sm:px-6 sm:py-7">
                        <div className="min-h-0 flex-1 overflow-y-auto pr-1">
                            <div className="space-y-5 pb-2">
                                <ScopeOverview scope={activeScope} />

                                {isEmptyState && (
                                    <section className="rounded-[24px] border border-primary/15 bg-gradient-to-br from-card via-card to-primary/5 px-5 py-5 shadow-sm sm:px-6 sm:py-6">
                                        <div className="min-w-0">
                                            <p className="text-[0.95rem] font-semibold text-foreground sm:text-[0.95rem]">
                                                Explore this note set
                                            </p>
                                            <p className="mt-2 max-w-2xl text-[0.92rem] leading-[1.6] text-muted-foreground sm:text-[0.95rem]">
                                                Use the notes currently in scope to surface patterns, compare themes, retrieve supporting evidence, and spot tensions or contradictions.
                                            </p>
                                            <div className="mt-5">
                                                <p className="mb-2 text-[0.68rem] font-semibold uppercase tracking-[0.18em] text-muted-foreground/80">
                                                    Good places to start
                                                </p>
                                                <div className="flex flex-wrap gap-2.5">
                                                    {STARTER_PROMPTS.map((prompt) => (
                                                        <button
                                                            key={prompt}
                                                            type="button"
                                                            onClick={() => void sendPrompt(prompt)}
                                                            className="rounded-full border border-border/70 bg-background/75 px-3 py-1.5 text-[0.72rem] text-foreground/85 transition-all hover:border-primary/35 hover:bg-primary/5 hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50 sm:px-3.5 sm:py-2 sm:text-xs"
                                                            disabled={isStreaming || activeScope.highlightIds.length === 0}
                                                        >
                                                            {prompt}
                                                        </button>
                                                    ))}
                                                </div>
                                            </div>
                                        </div>
                                    </section>
                                )}

                                {displayMessages.map((message) => {
                                    const showFollowUps =
                                        !isStreaming
                                        && message.role === "assistant"
                                        && message.id === latestAssistantMessageId;

                                    return (
                                        <div key={message.id} className="space-y-3">
                                            <div
                                                className={cn(
                                                    "flex w-full gap-3 animate-in fade-in slide-in-from-bottom-2 duration-300",
                                                    message.role === "user" ? "justify-end pr-1 sm:pr-2" : "justify-start"
                                                )}
                                            >
                                                {message.role === "assistant" && (
                                                    <div className="mt-1 flex size-8 shrink-0 items-center justify-center rounded-full bg-primary/20">
                                                        <Bot className="size-4 text-primary" />
                                                    </div>
                                                )}

                                                <div
                                                    className={cn(
                                                        "rounded-2xl shadow-sm",
                                                        message.role === "user"
                                                            ? "max-w-[80%] rounded-tr-sm bg-primary px-4 py-3.5 text-primary-foreground sm:max-w-[72%]"
                                                            : "max-w-[88%] rounded-tl-sm border border-border/40 bg-card/90 px-5 py-4 text-foreground sm:max-w-[78%]"
                                                    )}
                                                >
                                                    <div
                                                        className={cn(
                                                            "prose prose-sm max-w-none",
                                                            message.role === "user"
                                                                ? "text-primary-foreground [&_*]:text-primary-foreground"
                                                                : "leading-[1.6] text-[0.92rem] text-foreground/95 [&_p]:my-0 [&_p+p]:mt-4 sm:max-w-[70ch] sm:text-[0.98rem] sm:leading-7"
                                                        )}
                                                    >
                                                        {message.role === "user" ? (
                                                            <p className="m-0 leading-[1.55] text-[0.9rem] sm:text-[0.95rem]">{message.content}</p>
                                                        ) : (
                                                            <ReactMarkdown>{message.content}</ReactMarkdown>
                                                        )}
                                                    </div>
                                                </div>

                                                {message.role === "user" && (
                                                    <div className="mt-1 flex size-8 shrink-0 items-center justify-center rounded-full bg-secondary">
                                                        <User className="size-4 text-secondary-foreground" />
                                                    </div>
                                                )}
                                            </div>

                                            {showFollowUps && (
                                                <div className="ml-11 flex flex-wrap gap-2">
                                                    {FOLLOW_UP_ACTIONS.map((action) => (
                                                        <button
                                                            key={action.label}
                                                            type="button"
                                                            onClick={() => void sendPrompt(action.prompt)}
                                                            className="rounded-full border border-border/65 bg-background/80 px-3 py-1.5 text-[0.7rem] font-medium text-muted-foreground transition-all hover:border-primary/35 hover:bg-primary/5 hover:text-foreground sm:text-[0.72rem]"
                                                        >
                                                            {action.label}
                                                        </button>
                                                    ))}
                                                </div>
                                            )}
                                        </div>
                                    );
                                })}

                                {isStreaming && displayMessages[displayMessages.length - 1]?.role === "user" && (
                                    <div className="flex w-full gap-3 animate-in fade-in">
                                        <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary/20">
                                            <Bot className="size-4 text-primary" />
                                        </div>
                                        <div className="flex items-center gap-2 rounded-2xl rounded-tl-sm border border-border/50 bg-card px-4 py-3.5">
                                            <Loader2 className="size-4 animate-spin text-muted-foreground" />
                                            <span className="text-[0.9rem] font-medium text-muted-foreground sm:text-sm">
                                                Reading these notes...
                                            </span>
                                        </div>
                                    </div>
                                )}

                                {error && (
                                    <div className="flex w-full gap-3 animate-in fade-in">
                                        <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-destructive/20">
                                            <Bot className="size-4 text-destructive" />
                                        </div>
                                        <div className="rounded-2xl rounded-tl-sm border border-destructive/20 bg-destructive/10 px-4 py-3.5">
                                            <p className="text-[0.9rem] font-medium text-destructive sm:text-sm">
                                                {displayErrorMessage}
                                            </p>
                                        </div>
                                    </div>
                                )}

                                <div ref={messagesEndRef} />
                            </div>
                        </div>
                    </div>
                </div>

                <div className="flex-shrink-0 bg-gradient-to-b from-transparent via-background/90 to-background/95 px-0 pt-4 pb-[max(1.25rem,env(safe-area-inset-bottom))] sm:px-0">
                    <div className="mx-auto w-full max-w-4xl rounded-[24px] border border-border/45 bg-card/30 px-3 pt-3 pb-2 shadow-[0_-1px_0_rgba(255,255,255,0.02)] backdrop-blur-sm">
                        {hasScopeChanged && (
                            <div className="mb-3">
                                <ScopeChangedBanner onSync={syncToCurrentScope} compact />
                            </div>
                        )}

                        <div className="mb-3 flex flex-wrap items-center justify-between gap-2 px-1">
                            <div className="flex flex-wrap items-center gap-2">
                                <span className="rounded-full border border-border/70 bg-card/60 px-2.5 py-1 text-[0.68rem] font-medium text-foreground/88">
                                    {notesLabel}
                                </span>
                                {activeScope.totalMatches > activeScope.noteCount && (
                                    <span className="rounded-full border border-primary/20 bg-primary/10 px-2.5 py-1 text-[0.68rem] font-medium text-primary">
                                        Using {activeScope.noteCount} most recent
                                    </span>
                                )}
                            </div>
                            <span className="text-[0.65rem] text-muted-foreground/75">
                                Enter to send · Shift+Enter for newline
                            </span>
                        </div>

                        <form
                            onSubmit={onSubmit}
                            className="relative flex items-end gap-2 overflow-hidden rounded-2xl border border-border/60 bg-card shadow-sm transition-all focus-within:border-primary/50 focus-within:ring-1 focus-within:ring-primary/50"
                        >
                            <textarea
                                ref={textareaRef}
                                value={input}
                                onChange={(event) => setInput(event.target.value)}
                                placeholder={composerPlaceholder}
                                className="flex-1 max-h-40 min-h-[52px] w-full resize-none overflow-y-auto bg-transparent px-4 py-3 text-[0.92rem] outline-none placeholder:text-muted-foreground/70 sm:py-3.5 sm:text-[0.95rem]"
                                rows={1}
                                onKeyDown={(event) => {
                                    if (event.key === "Enter" && !event.shiftKey) {
                                        event.preventDefault();
                                        void onSubmit();
                                    }
                                }}
                                aria-label="Ask a question about these notes"
                                disabled={activeScope.highlightIds.length === 0}
                            />
                            <div className="mb-2 mr-2">
                                <button
                                    type="submit"
                                    disabled={!input.trim() || isStreaming || activeScope.highlightIds.length === 0}
                                    className="flex size-10 items-center justify-center rounded-xl bg-primary text-primary-foreground transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50"
                                    aria-label="Send notes question"
                                >
                                    {isStreaming ? (
                                        <Loader2 className="size-4 animate-spin" />
                                    ) : (
                                        <Send className="size-4 ml-0.5" />
                                    )}
                                </button>
                            </div>
                        </form>
                        <p className="mt-2 text-center text-[0.6rem] text-muted-foreground opacity-60">
                            {activeScope.highlightIds.length === 0
                                ? "No notes are currently in scope. Adjust the notes filters to enable Ask."
                                : "Notes-scoped assistant · Grounded only in the notes currently in scope."}
                        </p>
                    </div>
                </div>
            </section>
        );
    }

    return (
        <section
            className={cn(
                "flex h-full flex-col overflow-hidden rounded-[24px] border border-border/50 bg-card/35 shadow-[0_0_0_1px_rgba(255,255,255,0.02)] backdrop-blur-sm",
                mobile && "min-h-0 flex-1 rounded-t-[24px] rounded-b-none border-b-0",
                isSidebar && "min-h-[40rem]"
            )}
        >
            <header
                className={cn(
                    "shrink-0 border-b border-border/50 px-4 py-4",
                    isSidebar && "px-5 py-5"
                )}
            >
                {isSidebar ? (
                    <div className="flex items-center justify-between gap-3">
                        <div className="flex min-w-0 items-center gap-3">
                            <div className="flex size-9 shrink-0 items-center justify-center rounded-2xl border border-primary/20 bg-primary/10 text-primary">
                                <BotMessageSquare className="size-4" />
                            </div>
                            <h2 className="min-w-0 text-base font-bold leading-tight text-foreground">
                                Ask These Notes
                            </h2>
                        </div>

                        <Link
                            href={fullScreenHref}
                            className={sidebarUtilityActionClassName}
                            aria-label="Open Ask These Notes in full screen"
                            title="Open full screen"
                        >
                            <Expand className="size-4" />
                        </Link>
                    </div>
                ) : (
                    <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                            <div className="flex items-center gap-2">
                                <div className="flex size-9 shrink-0 items-center justify-center rounded-2xl border border-primary/20 bg-primary/10">
                                    <BotMessageSquare className="size-4 text-primary" />
                                </div>
                                <div className="min-w-0">
                                    <h2 className="truncate text-sm font-bold leading-tight text-foreground sm:text-base">
                                        Ask These Notes
                                    </h2>
                                    <p className="text-xs text-foreground/80">
                                        Answers grounded in the notes currently in view
                                    </p>
                                </div>
                            </div>
                        </div>

                        <div className="flex items-center gap-2">
                            {!isEmptyState && (
                                <button
                                    type="button"
                                    onClick={startNewChat}
                                    disabled={isStreaming}
                                    className={newChatActionClassName}
                                >
                                    <Plus className="size-3.5" />
                                    Start new chat
                                </button>
                            )}
                            <Link
                                href={fullScreenHref}
                                className={cn(mobile ? "inline-flex" : "hidden sm:inline-flex", headerActionClassName)}
                            >
                                Full Ask
                            </Link>
                            <button
                                type="button"
                                onClick={onClose}
                                className="rounded-lg p-2 text-muted-foreground transition-colors hover:bg-background/60 hover:text-foreground"
                                aria-label="Close notes AI panel"
                            >
                                <X className="size-4" />
                            </button>
                        </div>
                    </div>
                )}

                {!isSidebar && <ScopeOverview scope={activeScope} compact className="mt-4" />}
            </header>

            {hasScopeChanged && (
                <div className={cn(
                    "border-b border-border/40 px-4 py-4",
                    isSidebar && "px-5"
                )}>
                    <ScopeChangedBanner onSync={syncToCurrentScope} compact />
                </div>
            )}

            <div className={cn(
                "min-h-0 flex-1 overflow-y-auto px-4 py-4",
                isSidebar && "px-5 py-5"
            )}>
                <div className={cn("space-y-4", isSidebar && "space-y-5")}>
                    {isEmptyState && (
                        <section className={cn(
                            "rounded-[20px] border border-primary/15 bg-gradient-to-br from-card via-card to-primary/5 px-4 py-4 shadow-sm",
                            isSidebar && "px-5 py-5"
                        )}>
                            <div className="flex items-start gap-3">
                                <div className="min-w-0">
                                    <p className="text-sm font-semibold text-foreground">
                                        {isSidebar ? "Use AI across this note set" : "Ask across this notes view"}
                                    </p>
                                    <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                                        {isSidebar
                                            ? "Use the filtered notes on the left for synthesis, retrieval, and pattern-finding."
                                            : "Use the notes currently on screen as context for synthesis, comparison, and retrieval."}
                                    </p>
                                    <div className={cn(
                                        "mt-4 flex flex-wrap gap-2",
                                        isSidebar && "gap-2.5"
                                    )}>
                                        {visibleStarterPrompts.map((prompt) => (
                                            <button
                                                key={prompt}
                                                type="button"
                                                onClick={() => void sendPrompt(prompt)}
                                                className={cn(
                                                    "rounded-full border border-border/70 bg-background/75 px-3 py-1.5 text-xs text-foreground/85 transition-all hover:border-primary/35 hover:bg-primary/5 hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50",
                                                    isSidebar && "px-3.5 py-2 text-[0.76rem]"
                                                )}
                                                disabled={isStreaming || activeScope.highlightIds.length === 0}
                                            >
                                                {prompt}
                                            </button>
                                        ))}
                                    </div>

                                    {isSidebar && STARTER_PROMPTS.length > 2 && (
                                        <button
                                            type="button"
                                            onClick={() => setShowAllStarterPrompts((current) => !current)}
                                            className="mt-3 inline-flex items-center gap-1.5 text-[0.72rem] font-medium text-muted-foreground transition-colors hover:text-foreground"
                                        >
                                            {showAllStarterPrompts ? "Show fewer prompts" : "More prompts"}
                                            <ArrowRight className={cn("size-3 transition-transform", showAllStarterPrompts && "rotate-90")} />
                                        </button>
                                    )}
                                </div>
                            </div>
                        </section>
                    )}

                    {displayMessages.map((message) => {
                        const showFollowUps =
                            !isStreaming
                            && message.role === "assistant"
                            && message.id === latestAssistantMessageId;

                        return (
                            <div key={message.id} className="space-y-3">
                                <div className={cn(
                                    "flex w-full gap-3 animate-in fade-in slide-in-from-bottom-2 duration-300",
                                    message.role === "user" ? "justify-end" : "justify-start"
                                )}>
                                    {message.role === "assistant" && (
                                        <div className="mt-1 flex size-8 shrink-0 items-center justify-center rounded-full bg-primary/20">
                                            <Bot className="size-4 text-primary" />
                                        </div>
                                    )}

                                    <div
                                        className={cn(
                                            "rounded-2xl shadow-sm",
                                            message.role === "user"
                                                ? "max-w-[86%] rounded-tr-sm bg-primary px-4 py-3 text-primary-foreground"
                                                : "max-w-[92%] rounded-tl-sm border border-border/40 bg-card/90 px-4 py-3 text-foreground"
                                        )}
                                    >
                                        <div
                                            className={cn(
                                                "prose prose-sm max-w-none",
                                                message.role === "user"
                                                    ? "text-primary-foreground [&_*]:text-primary-foreground"
                                                    : "leading-7 text-[0.94rem] text-foreground/95 [&_p]:my-0 [&_p+p]:mt-4"
                                            )}
                                        >
                                            {message.role === "user" ? (
                                                <p className="m-0 leading-relaxed text-[0.92rem]">{message.content}</p>
                                            ) : (
                                                <ReactMarkdown>{message.content}</ReactMarkdown>
                                            )}
                                        </div>
                                    </div>

                                    {message.role === "user" && (
                                        <div className="mt-1 flex size-8 shrink-0 items-center justify-center rounded-full bg-secondary">
                                            <User className="size-4 text-secondary-foreground" />
                                        </div>
                                    )}
                                </div>

                                {showFollowUps && (
                                    <div className="ml-11 flex flex-wrap gap-2">
                                        {FOLLOW_UP_ACTIONS.map((action) => (
                                            <button
                                                key={action.label}
                                                type="button"
                                                onClick={() => void sendPrompt(action.prompt)}
                                                className="rounded-full border border-border/65 bg-background/80 px-3 py-1.5 text-[0.72rem] font-medium text-muted-foreground transition-all hover:border-primary/35 hover:bg-primary/5 hover:text-foreground"
                                            >
                                                {action.label}
                                            </button>
                                        ))}
                                    </div>
                                )}
                            </div>
                        );
                    })}

                    {isStreaming && displayMessages[displayMessages.length - 1]?.role === "user" && (
                        <div className="flex w-full gap-3 animate-in fade-in">
                            <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary/20">
                                <Bot className="size-4 text-primary" />
                            </div>
                            <div className="flex items-center gap-2 rounded-2xl rounded-tl-sm border border-border/50 bg-card px-4 py-3">
                                <Loader2 className="size-4 animate-spin text-muted-foreground" />
                                <span className="text-sm font-medium text-muted-foreground">
                                    Reading these notes...
                                </span>
                            </div>
                        </div>
                    )}

                    {error && (
                        <div className="flex w-full gap-3 animate-in fade-in">
                            <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-destructive/20">
                                <Bot className="size-4 text-destructive" />
                            </div>
                            <div className="rounded-2xl rounded-tl-sm border border-destructive/20 bg-destructive/10 px-4 py-3">
                                <p className="text-sm font-medium text-destructive">
                                    {displayErrorMessage}
                                </p>
                            </div>
                        </div>
                    )}

                    {!isEmptyState && (
                        <Link
                            href={fullScreenHref}
                            className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground sm:hidden"
                        >
                            Open full Ask These Notes
                            <ArrowRight className="size-3" />
                        </Link>
                    )}

                    <div ref={messagesEndRef} />
                </div>
            </div>

            <div className={cn(
                "shrink-0 border-t border-border/45 bg-card/30 px-3 pt-3 pb-[max(0.85rem,env(safe-area-inset-bottom))]",
                isSidebar && "px-4 pt-4"
            )}>
                {hasScopeChanged && (
                    <div className="mb-3">
                        <ScopeChangedBanner onSync={syncToCurrentScope} compact />
                    </div>
                )}

                <div className="mb-3 flex flex-wrap items-center justify-between gap-2 px-1">
                    <div className="flex flex-wrap items-center gap-2">
                        <span className="rounded-full border border-border/70 bg-card/60 px-2.5 py-1 text-[0.68rem] font-medium text-foreground/88">
                            {notesLabel}
                        </span>
                        {isSidebar && (
                            <span className="rounded-full border border-border/60 bg-background/55 px-2.5 py-1 text-[0.68rem] text-foreground/78">
                                {activeScope.summary.trim() || "All content"}
                            </span>
                        )}
                        {activeScope.totalMatches > activeScope.noteCount && (
                            <span className="rounded-full border border-primary/20 bg-primary/10 px-2.5 py-1 text-[0.68rem] font-medium text-primary">
                                Using {activeScope.noteCount} most recent
                            </span>
                        )}
                    </div>
                    {isSidebar && !isEmptyState ? (
                        <button
                            type="button"
                            onClick={startNewChat}
                            disabled={isStreaming}
                            className={newChatActionClassName}
                        >
                            <Plus className="size-3.5" />
                            Start new chat
                        </button>
                    ) : !isSidebar && !mobile ? (
                            <span className="text-[0.62rem] text-muted-foreground/75 sm:text-[0.65rem]">
                                Enter to send · Shift+Enter for newline
                            </span>
                    ) : null}
                </div>

                <form
                    onSubmit={onSubmit}
                    className="relative flex items-end gap-2 overflow-hidden rounded-2xl border border-border/60 bg-card shadow-sm transition-all focus-within:border-primary/50 focus-within:ring-1 focus-within:ring-primary/50"
                >
                    <textarea
                        ref={textareaRef}
                        value={input}
                        onChange={(event) => setInput(event.target.value)}
                        placeholder={composerPlaceholder}
                        className="min-h-[54px] max-h-40 w-full flex-1 resize-none bg-transparent px-4 py-3 text-[0.93rem] outline-none placeholder:text-muted-foreground/70"
                        rows={1}
                        onKeyDown={(event) => {
                            if (event.key === "Enter" && !event.shiftKey) {
                                event.preventDefault();
                                void onSubmit();
                            }
                        }}
                        aria-label="Ask a question about the notes in view"
                        disabled={activeScope.highlightIds.length === 0}
                    />
                    <div className="mb-2 mr-2">
                        <button
                            type="submit"
                            disabled={!input.trim() || isStreaming || activeScope.highlightIds.length === 0}
                            className="flex size-10 items-center justify-center rounded-xl bg-primary text-primary-foreground transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50"
                            aria-label="Send notes question"
                        >
                            {isStreaming ? (
                                <Loader2 className="size-4 animate-spin" />
                            ) : (
                                <Send className="size-4 ml-0.5" />
                            )}
                        </button>
                    </div>
                </form>
                <p className="mt-2 flex items-center gap-1.5 text-[0.65rem] font-medium text-muted-foreground opacity-65">
                    <BookOpen className="size-3" />
                    {activeScope.highlightIds.length === 0
                        ? "No notes are currently in scope. Adjust the notes filters to enable Ask."
                        : isSidebar
                            ? "Grounded only in the notes currently in scope."
                            : "Notes-scoped assistant · grounded only in the notes currently in scope."}
                </p>
            </div>
        </section>
    );
}
