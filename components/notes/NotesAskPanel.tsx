"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import Link from "next/link";
import ReactMarkdown from "react-markdown";
import { useChat } from "@ai-sdk/react";
import { TextStreamChatTransport } from "ai";
import {
    ArrowRight,
    BookOpen,
    Bot,
    BotMessageSquare,
    Loader2,
    RefreshCw,
    Send,
    Sparkles,
    User,
    X,
} from "lucide-react";
import { cn } from "@/lib/utils";

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
const NOTES_FULL_SCREEN_TARGET = `/ask?scope=notes&returnTo=${encodeURIComponent(NOTES_RETURN_TARGET)}`;

export interface NotesChatScope {
    highlightIds: string[];
    noteCount: number;
    totalMatches: number;
    summary: string;
    signature: string;
}

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

export function NotesAskPanel({
    currentScope,
    onClose,
    mobile = false,
    variant = "default",
}: NotesAskPanelProps) {
    const [input, setInput] = useState("");
    const [activeScope, setActiveScope] = useState<NotesChatScope>(currentScope);
    const messagesEndRef = useRef<HTMLDivElement>(null);
    const textareaRef = useRef<HTMLTextAreaElement>(null);
    const hasMountedRef = useRef(false);
    const previousMessageCountRef = useRef(0);
    const previousStatusRef = useRef<string | null>(null);

    const {
        messages,
        sendMessage,
        setMessages,
        status,
        error,
    } = useChat({
        transport: chatTransport,
    });

    useEffect(() => {
        if (messages.length === 0) {
            setActiveScope(currentScope);
        }
    }, [currentScope, messages.length]);

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
    const scopeSummary = activeScope.summary.trim();

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

    return (
        <section
            className={cn(
                "flex h-full flex-col overflow-hidden rounded-[24px] border border-border/50 bg-card/35 shadow-[0_0_0_1px_rgba(255,255,255,0.02)] backdrop-blur-sm",
                mobile && "rounded-t-[24px] rounded-b-none border-b-0",
                isSidebar && "min-h-[40rem]",
                isPage && "rounded-none border-x-0 border-b-0 shadow-none"
            )}
        >
            <header className={cn(
                "border-b border-border/50 px-4 py-4",
                isSidebar && "px-5 py-5"
            )}>
                <div className={cn(
                    "flex items-start justify-between gap-3",
                    isSidebar && "grid grid-cols-[minmax(0,1fr)_auto] gap-x-4"
                )}>
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
                                    {isSidebar ? "Notes-scoped copilot" : "Answers grounded in the notes currently in view"}
                                </p>
                            </div>
                        </div>
                        <div className="mt-3 flex flex-wrap items-center gap-2 text-[0.72rem] text-muted-foreground">
                            <span className="rounded-full border border-white/10 bg-background/70 px-2.5 py-1">
                                {activeScope.noteCount} notes in scope
                            </span>
                            {activeScope.totalMatches > activeScope.noteCount && (
                                <span className="rounded-full border border-white/10 bg-background/70 px-2.5 py-1">
                                    using 40 most recent
                                </span>
                            )}
                        </div>
                        {scopeSummary && (
                            <p className={cn(
                                "mt-2 text-xs leading-relaxed text-muted-foreground",
                                isSidebar && "line-clamp-2 max-w-full"
                            )}>
                                {scopeSummary}
                            </p>
                        )}
                    </div>

                    <div className={cn(
                        "flex items-center gap-1",
                        isSidebar && "row-span-2 self-start justify-self-end"
                    )}>
                        {!isPage && (
                            <Link
                                href={NOTES_FULL_SCREEN_TARGET}
                                className="hidden rounded-lg px-2.5 py-2 text-xs font-medium text-muted-foreground transition-colors hover:bg-background/60 hover:text-foreground sm:inline-flex"
                            >
                                {isSidebar ? "Full screen" : "Full Ask"}
                            </Link>
                        )}
                        {!isSidebar && !isPage && (
                            <button
                                type="button"
                                onClick={onClose}
                                className="rounded-lg p-2 text-muted-foreground transition-colors hover:bg-background/60 hover:text-foreground"
                                aria-label="Close notes AI panel"
                            >
                                <X className="size-4" />
                            </button>
                        )}
                    </div>
                </div>
            </header>

            {hasScopeChanged && (
                <div className={cn(
                    "border-b border-border/40 bg-primary/5 px-4 py-3",
                    isSidebar && "px-5"
                )}>
                    <div className="flex items-start justify-between gap-3">
                        <p className="text-xs leading-relaxed text-muted-foreground">
                            Your filters changed. This chat is still using the earlier notes snapshot.
                        </p>
                        <button
                            type="button"
                            onClick={syncToCurrentScope}
                            className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-primary/25 bg-primary/10 px-3 py-1 text-[0.72rem] font-medium text-primary transition-colors hover:bg-primary/15"
                        >
                            <RefreshCw className="size-3" />
                            Use current filters
                        </button>
                    </div>
                </div>
            )}

            <div className={cn(
                "flex-1 overflow-y-auto px-4 py-4",
                isSidebar && "px-5 py-5"
            )}>
                <div className={cn("space-y-4", isSidebar && "space-y-5")}>
                    {isEmptyState && (
                        <section className={cn(
                            "rounded-[20px] border border-primary/15 bg-gradient-to-br from-card via-card to-primary/5 px-4 py-4 shadow-sm",
                            isSidebar && "px-5 py-5"
                        )}>
                            <div className="flex items-start gap-3">
                                <div className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                                    <Sparkles className="size-4" />
                                </div>
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
                                        {STARTER_PROMPTS.map((prompt) => (
                                            <button
                                                key={prompt}
                                                type="button"
                                                onClick={() => void sendPrompt(prompt)}
                                                className={cn(
                                                    "rounded-full border border-border/70 bg-background/75 px-3 py-1.5 text-xs text-foreground/85 transition-all hover:border-primary/35 hover:bg-primary/5 hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50",
                                                    isSidebar && "w-full justify-center px-4 py-2 text-[0.79rem]"
                                                )}
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

                    {!isEmptyState && !isPage && (
                        <Link
                            href={NOTES_FULL_SCREEN_TARGET}
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
                "border-t border-border/45 bg-card/30 px-3 pt-3 pb-[max(0.85rem,env(safe-area-inset-bottom))]",
                isSidebar && "px-4 pt-4"
            )}>
                <form
                    onSubmit={onSubmit}
                    className="relative flex items-end gap-2 overflow-hidden rounded-2xl border border-border/60 bg-card shadow-sm transition-all focus-within:border-primary/50 focus-within:ring-1 focus-within:ring-primary/50"
                >
                    <textarea
                        ref={textareaRef}
                        value={input}
                        onChange={(event) => setInput(event.target.value)}
                        placeholder={
                            activeScope.highlightIds.length === 0
                                ? "No notes in scope. Adjust your filters first."
                                : "Ask about the notes in this view..."
                        }
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
                    {isSidebar
                        ? "Grounded only in the notes currently in scope."
                        : isPage
                            ? "Grounded only in the notes currently in scope."
                        : "Notes-scoped assistant · grounded only in the notes currently in scope."}
                </p>
            </div>
        </section>
    );
}
