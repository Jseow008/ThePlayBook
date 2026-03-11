"use client";

import { useRef, useEffect, useState, useMemo, type FormEvent } from "react";
import { createPortal } from "react-dom";
import { useChat } from "@ai-sdk/react";
import { TextStreamChatTransport } from "ai";
import { Bot, User, Send, Loader2, X, BotMessageSquare, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";
import ReactMarkdown from "react-markdown";

interface AuthorChatProps {
    contentId: string;
    authorName: string;
    bookTitle: string;
    onClose: () => void;
}

const FALLBACK_CHAT_ERROR = "Something went wrong. Please try asking again.";

const STARTER_PROMPTS = [
    "What's the core argument I should walk away with?",
    "What would a skeptic say about this?",
    "How would you apply this in real life?",
    "Which idea in this book matters most?",
] as const;

const FOLLOW_UP_ACTIONS = [
    {
        label: "Go deeper",
        prompt: "Go deeper on your last point and explain why it matters.",
    },
    {
        label: "Give me an example",
        prompt: "Give me a concrete real-world example of your last point.",
    },
    {
        label: "What's the counterargument?",
        prompt: "What's the strongest counterargument to your last point?",
    },
] as const;

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

export function AuthorChat({ contentId, authorName, bookTitle, onClose }: AuthorChatProps) {
    const transport = useMemo(
        () =>
            new TextStreamChatTransport({
                api: "/api/chat/author",
                body: { contentId, authorName, bookTitle },
            }),
        [contentId, authorName, bookTitle]
    );

    const [mounted, setMounted] = useState(false);
    useEffect(() => setMounted(true), []);

    // Lock body scroll while chat overlay is open
    useEffect(() => {
        const original = document.body.style.overflow;
        document.body.style.overflow = "hidden";
        return () => { document.body.style.overflow = original; };
    }, []);

    const {
        messages,
        sendMessage,
        status,
        error,
    } = useChat({ transport });
    const displayErrorMessage = useMemo(() => getDisplayErrorMessage(error), [error]);

    const [input, setInput] = useState("");
    const messagesEndRef = useRef<HTMLDivElement>(null);
    const textareaRef = useRef<HTMLTextAreaElement>(null);
    const mainRef = useRef<HTMLDivElement>(null);

    // Auto-scroll to bottom when new messages arrive
    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }, [messages, status]);

    // Auto-resize textarea
    useEffect(() => {
        const textarea = textareaRef.current;
        if (textarea) {
            textarea.style.height = "auto";
            textarea.style.height = `${Math.min(textarea.scrollHeight, 160)}px`;
        }
    }, [input]);

    const isStreaming = status === "streaming" || status === "submitted";

    const sendPrompt = async (text: string) => {
        const trimmed = text.trim();
        if (!trimmed || isStreaming) return;
        setInput("");
        if (textareaRef.current) textareaRef.current.style.height = "auto";
        await sendMessage({ text: trimmed });
    };

    const onSubmit = async (e?: FormEvent) => {
        e?.preventDefault();
        await sendPrompt(input);
    };

    const getMessageText = (m: (typeof messages)[number]): string => {
        const partsText = m.parts
            ?.filter((p): p is { type: "text"; text: string } =>
                p.type === "text" && typeof (p as { text?: unknown }).text === "string"
            )
            .map((p) => p.text)
            .join("") || "";

        if (partsText) return partsText;

        const maybeContent = (m as unknown as { content?: unknown }).content;
        return typeof maybeContent === "string" ? maybeContent : "";
    };

    const displayMessages: Array<{ id: string; role: string; content: string }> = messages.map((m) => {
        return {
            id: m.id,
            role: m.role,
            content: getMessageText(m),
        };
    });

    const latestAssistantMessageId = [...displayMessages]
        .reverse()
        .find((message) => message.role === "assistant")?.id;
    const isEmptyState = displayMessages.length === 0;

    if (!mounted) return null;

    return createPortal(
        <div
            role="dialog"
            aria-modal="true"
            aria-label={`Chat with ${authorName} persona`}
            className="fixed inset-0 z-[100] flex flex-col bg-background/95 backdrop-blur-md animate-in fade-in duration-300"
        >
            <header className="flex-shrink-0 border-b border-border/50 px-4 py-3 sm:px-6">
                <div className="mx-auto flex w-full max-w-4xl items-center justify-between gap-4">
                    <div className="flex min-w-0 items-center gap-3">
                        <div className="flex size-10 shrink-0 items-center justify-center rounded-2xl border border-primary/20 bg-primary/10">
                            <BotMessageSquare className="size-4 text-primary" />
                        </div>
                        <div className="min-w-0">
                            <h2 className="truncate text-sm font-bold leading-tight text-foreground sm:text-base">{authorName}</h2>
                            <p className="truncate text-xs text-foreground/80">{bookTitle}</p>
                            <p className="mt-0.5 truncate text-[0.65rem] leading-none text-muted-foreground">Author Persona &middot; AI</p>
                        </div>
                    </div>
                    <button
                        onClick={onClose}
                        className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-muted/60 hover:bg-muted transition-colors"
                        aria-label="Close chat"
                    >
                        <X className="size-4 text-muted-foreground" />
                    </button>
                </div>
            </header>

            <main
                ref={mainRef}
                className="flex-1 overflow-y-auto overscroll-contain"
            >
                <div className="mx-auto flex min-h-full w-full max-w-5xl flex-col px-4 pt-6 pb-3 sm:px-6">
                    <div className="flex-1 rounded-[28px] border border-border/50 bg-card/35 shadow-[0_0_0_1px_rgba(255,255,255,0.02)] backdrop-blur-sm">
                        <div className="mx-auto w-full max-w-4xl px-4 py-6 sm:px-6 sm:py-7">
                            <div className="space-y-5">
                                {isEmptyState && (
                                    <section className="rounded-[24px] border border-primary/15 bg-gradient-to-br from-card via-card to-primary/5 px-5 py-5 shadow-sm sm:px-6 sm:py-6">
                                        <div className="flex items-start gap-4">
                                            <div className="mt-0.5 flex size-10 shrink-0 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                                                <Sparkles className="size-4" />
                                            </div>
                                            <div className="min-w-0">
                                                <p className="text-sm font-semibold text-foreground sm:text-[0.95rem]">
                                                    Keep the conversation going
                                                </p>
                                                <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted-foreground sm:text-[0.95rem]">
                                                    You&apos;ve finished reading <span className="font-medium text-foreground">{bookTitle}</span>. Use this space to test the ideas, pressure the arguments, or pull out the point that matters most.
                                                </p>
                                                <div className="mt-5">
                                                    <p className="mb-2 text-[0.7rem] font-semibold uppercase tracking-[0.18em] text-muted-foreground/80">
                                                        Good places to start
                                                    </p>
                                                    <div className="flex flex-wrap gap-2.5">
                                                        {STARTER_PROMPTS.map((prompt) => (
                                                            <button
                                                                key={prompt}
                                                                onClick={() => void sendPrompt(prompt)}
                                                                className="rounded-full border border-border/70 bg-background/75 px-3.5 py-2 text-xs text-foreground/85 transition-all hover:border-primary/35 hover:bg-primary/5 hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50"
                                                                disabled={isStreaming}
                                                            >
                                                                {prompt}
                                                            </button>
                                                        ))}
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    </section>
                                )}

                                {displayMessages.map((m) => {
                                    const showFollowUpActions = !isStreaming && m.role === "assistant" && m.id === latestAssistantMessageId;

                                    return (
                                        <div key={m.id} className="space-y-3">
                                            <div
                                                className={cn(
                                                    "flex w-full gap-3 animate-in fade-in slide-in-from-bottom-2 duration-300",
                                                    m.role === "user" ? "justify-end pr-1 sm:pr-2" : "justify-start"
                                                )}
                                            >
                                                {m.role === "assistant" && (
                                                    <div className="mt-1 flex size-8 shrink-0 items-center justify-center rounded-full bg-primary/20">
                                                        <Bot className="size-4 text-primary" />
                                                    </div>
                                                )}
                                                <div
                                                    className={cn(
                                                        "rounded-2xl shadow-sm",
                                                        m.role === "user"
                                                            ? "max-w-[80%] rounded-tr-sm bg-primary px-4 py-3.5 text-primary-foreground sm:max-w-[72%]"
                                                            : "max-w-[88%] rounded-tl-sm border border-border/40 bg-card/90 px-5 py-4 text-foreground sm:max-w-[78%]"
                                                    )}
                                                >
                                                    <div
                                                        className={cn(
                                                            "prose prose-sm max-w-none",
                                                            m.role === "user"
                                                                ? "text-primary-foreground [&_*]:text-primary-foreground"
                                                                : "leading-7 text-[0.98rem] text-foreground/95 [&_p]:my-0 [&_p+p]:mt-4 sm:max-w-[70ch]"
                                                        )}
                                                    >
                                                        {m.role === "user" ? (
                                                            <p className="m-0 leading-relaxed text-[0.95rem]">{m.content}</p>
                                                        ) : (
                                                            <ReactMarkdown>{m.content}</ReactMarkdown>
                                                        )}
                                                    </div>
                                                </div>
                                                {m.role === "user" && (
                                                    <div className="mt-1 flex size-8 shrink-0 items-center justify-center rounded-full bg-secondary">
                                                        <User className="size-4 text-secondary-foreground" />
                                                    </div>
                                                )}
                                            </div>

                                            {showFollowUpActions && (
                                                <div className="ml-11 flex flex-wrap gap-2">
                                                    {FOLLOW_UP_ACTIONS.map((action) => (
                                                        <button
                                                            key={action.label}
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
                                        <div className="flex items-center gap-2 rounded-2xl rounded-tl-sm border border-border/50 bg-card px-4 py-3.5">
                                            <Loader2 className="size-4 animate-spin text-muted-foreground" />
                                            <span className="text-sm font-medium text-muted-foreground">Thinking...</span>
                                        </div>
                                    </div>
                                )}

                                {error && (
                                    <div className="flex w-full gap-3 animate-in fade-in">
                                        <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-destructive/20">
                                            <Bot className="size-4 text-destructive" />
                                        </div>
                                        <div className="rounded-2xl rounded-tl-sm border border-destructive/20 bg-destructive/10 px-4 py-3.5">
                                            <p className="text-sm font-medium text-destructive">
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
            </main>

            <div className="flex-shrink-0 bg-gradient-to-b from-transparent via-background/90 to-background/95 px-4 pt-2 pb-[max(1.25rem,env(safe-area-inset-bottom))] sm:px-6">
                <div className="mx-auto w-full max-w-5xl">
                    <div className="mx-auto w-full max-w-4xl rounded-[24px] border border-border/45 bg-card/30 px-3 pt-3 pb-2 shadow-[0_-1px_0_rgba(255,255,255,0.02)] backdrop-blur-sm">
                        <form
                            onSubmit={onSubmit}
                            className="relative flex items-end gap-2 overflow-hidden rounded-2xl border border-border/60 bg-card shadow-sm transition-all focus-within:border-primary/50 focus-within:ring-1 focus-within:ring-primary/50"
                        >
                            <textarea
                                ref={textareaRef}
                                value={input}
                                onChange={(e) => setInput(e.target.value)}
                                placeholder={`Ask ${authorName} anything...`}
                                className="flex-1 max-h-40 min-h-[52px] w-full resize-none bg-transparent px-4 py-3.5 text-[0.95rem] outline-none placeholder:text-muted-foreground/70 overflow-y-auto"
                                rows={1}
                                onKeyDown={(e) => {
                                    if (e.key === "Enter" && !e.shiftKey) {
                                        e.preventDefault();
                                        void onSubmit();
                                    }
                                }}
                                aria-label={`Ask ${authorName} a question`}
                            />
                            <div className="mb-2 mr-2">
                                <button
                                    type="submit"
                                    disabled={!input.trim() || isStreaming}
                                    className="size-10 rounded-xl bg-primary text-primary-foreground flex items-center justify-center disabled:opacity-50 disabled:cursor-not-allowed hover:bg-primary/90 transition-colors"
                                    aria-label="Send message"
                                >
                                    {isStreaming ? (
                                        <Loader2 className="size-4 animate-spin" />
                                    ) : (
                                        <Send className="size-4 ml-0.5" />
                                    )}
                                </button>
                            </div>
                        </form>
                        <p className="mt-2 text-center text-[0.6rem] text-muted-foreground opacity-50">
                            AI persona · Responses are generated, not from the actual author
                        </p>
                    </div>
                </div>
            </div>
        </div>,
        document.body
    );
}
