"use client";

import { useRef, useEffect, useState, type FormEvent } from "react";
import { useChat } from "@ai-sdk/react";
import { TextStreamChatTransport } from "ai";
import { Bot, User, Send, BotMessageSquare, Loader2, BookOpen, ArrowLeft, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";
import ReactMarkdown from "react-markdown";
import Link from "next/link";

const chatTransport = new TextStreamChatTransport({ api: "/api/chat" });

const FALLBACK_CHAT_ERROR = "Something went wrong. Please try asking again.";

const STARTER_PROMPTS = [
    "What themes show up across my saved books?",
    "Summarize the most actionable ideas in my library.",
    "Which book in my library is most relevant to this topic?",
    "Compare different perspectives from my saved books.",
] as const;

const FOLLOW_UP_ACTIONS = [
    {
        label: "Which book says this?",
        prompt: "Which saved book most strongly supports your last answer? Cite the specific source from my library.",
    },
    {
        label: "Summarize the overlap",
        prompt: "Summarize the shared idea across the sources behind your last answer.",
    },
    {
        label: "Show me another perspective",
        prompt: "Show me a contrasting perspective from another saved book, if one exists.",
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

export function AskClientPage() {
    const {
        messages,
        sendMessage,
        status,
        error,
    } = useChat({
        transport: chatTransport,
    });

    const [input, setInput] = useState("");
    const messagesEndRef = useRef<HTMLDivElement>(null);
    const textareaRef = useRef<HTMLTextAreaElement>(null);

    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }, [messages, status]);

    useEffect(() => {
        const textarea = textareaRef.current;
        if (textarea) {
            textarea.style.height = "auto";
            textarea.style.height = `${Math.min(textarea.scrollHeight, 192)}px`;
        }
    }, [input]);

    const isStreaming = status === "streaming" || status === "submitted";
    const displayErrorMessage = getDisplayErrorMessage(error);

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

    return (
        <div className="flex h-[100dvh] flex-col bg-background">
            <header className="flex-shrink-0 border-b border-border/50 px-4 py-3 sm:px-6">
                <div className="mx-auto flex w-full max-w-4xl items-center justify-between gap-4">
                    <div className="flex min-w-0 items-center gap-3">
                        <Link
                            href="/"
                            className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-muted/60 transition-colors hover:bg-muted"
                            aria-label="Back to home"
                        >
                            <ArrowLeft className="size-4 text-muted-foreground" />
                        </Link>
                        <div className="flex size-10 shrink-0 items-center justify-center rounded-2xl border border-primary/20 bg-primary/10">
                            <BotMessageSquare className="size-4 text-primary" />
                        </div>
                        <div className="min-w-0">
                            <h1 className="truncate text-sm font-bold leading-tight text-foreground sm:text-base">Ask My Library</h1>
                            <p className="truncate text-xs text-foreground/80">Answers grounded in the books you&apos;ve saved</p>
                            <p className="mt-0.5 truncate text-[0.65rem] leading-none text-muted-foreground">Library Assistant &middot; AI Search</p>
                        </div>
                    </div>
                </div>
            </header>

            <main className="flex-1 overflow-y-auto overscroll-contain">
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
                                                    Search the ideas you&apos;ve saved
                                                </p>
                                                <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted-foreground sm:text-[0.95rem]">
                                                    Ask questions across your library and get answers grounded only in the books you&apos;ve saved. This works best when you want to compare, synthesize, or retrieve ideas from your reading history.
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
                                            <span className="text-sm font-medium text-muted-foreground">
                                                Reading your library...
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
                                placeholder="Ask about the ideas in your library..."
                                className="flex-1 max-h-48 min-h-[56px] w-full resize-none bg-transparent px-5 py-4 text-[0.95rem] outline-none placeholder:text-muted-foreground/70 overflow-y-auto"
                                rows={1}
                                onKeyDown={(e) => {
                                    if (e.key === "Enter" && !e.shiftKey) {
                                        e.preventDefault();
                                        void onSubmit();
                                    }
                                }}
                                aria-label="Ask a question about your library"
                            />
                            <div className="mb-2 mr-2">
                                <button
                                    type="submit"
                                    disabled={!input.trim() || isStreaming}
                                    className="flex size-10 items-center justify-center rounded-xl bg-primary text-primary-foreground transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50"
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
                        <div className="mt-2 text-center">
                            <p className="flex items-center justify-center gap-1.5 text-[0.65rem] font-medium text-muted-foreground opacity-60">
                                <BookOpen className="size-3" />
                                Powered by OpenAI · Searches only your saved library.
                            </p>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
