"use client";

import { useRef, useEffect, useState, useMemo, type FormEvent } from "react";
import { createPortal } from "react-dom";
import { useChat } from "@ai-sdk/react";
import { TextStreamChatTransport } from "ai";
import { Bot, User, Send, Loader2, X, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";
import ReactMarkdown from "react-markdown";

interface AuthorChatProps {
    contentId: string;
    authorName: string;
    bookTitle: string;
    onClose: () => void;
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

    const onSubmit = async (e?: FormEvent) => {
        e?.preventDefault();
        const trimmed = input.trim();
        if (!trimmed || isStreaming) return;
        setInput("");
        if (textareaRef.current) textareaRef.current.style.height = "auto";
        await sendMessage({ text: trimmed });
    };

    const suggestedQuestions = [
        `What inspired you to write this?`,
        `Can you give me a real-world example?`,
        `What's a common misconception about your ideas?`,
    ];

    // Build display messages with a welcome message prepended
    const displayMessages: Array<{ id: string; role: string; content: string }> = [
        {
            id: "welcome",
            role: "assistant",
            content: `I'm ${authorName}. You've just finished reading my work, *${bookTitle}*. I'd love to hear your thoughts — ask me anything, challenge my ideas, or let's explore a concept together.`,
        },
        ...messages.map((m) => ({
            id: m.id,
            role: m.role,
            content: m.parts
                ?.filter((p) => p.type === "text")
                .map((p) => (p as any).text)
                .join("") || "",
        })),
    ];

    if (!mounted) return null;

    return createPortal(
        // Outer shell: fixed full-screen, flex column — single source of truth for layout
        <div
            role="dialog"
            aria-modal="true"
            aria-label={`Chat with ${authorName} persona`}
            className="fixed inset-0 z-[100] flex flex-col bg-background/95 backdrop-blur-md animate-in fade-in duration-300"
        >

            {/* ── Header (flex-shrink-0) ── */}
            <header className="flex-shrink-0 h-14 border-b border-border/50 flex items-center justify-between px-4 sm:px-6 gap-4">
                <div className="flex items-center gap-3 flex-1 min-w-0">
                    <div className="shrink-0 size-8 rounded-full bg-primary/20 flex items-center justify-center">
                        <Sparkles className="size-4 text-primary" />
                    </div>
                    <div className="flex-1 min-w-0">
                        <h2 className="text-sm font-bold text-foreground leading-tight truncate">{authorName}</h2>
                        <p className="text-[0.65rem] text-muted-foreground leading-none mt-0.5 truncate">Author Persona &middot; AI</p>
                    </div>
                </div>
                <button
                    onClick={onClose}
                    className="shrink-0 size-8 rounded-lg bg-muted/60 flex items-center justify-center hover:bg-muted transition-colors"
                    aria-label="Close chat"
                >
                    <X className="size-4 text-muted-foreground" />
                </button>
            </header>

            {/* ── Messages (flex-1, scrolls independently) ── */}
            <main
                ref={mainRef}
                className="flex-1 overflow-y-auto overscroll-contain"
            >
                <div className="max-w-2xl mx-auto px-4 sm:px-6 py-5 space-y-5">
                    {displayMessages.map((m) => (
                        <div
                            key={m.id}
                            className={cn(
                                "flex gap-3 w-full animate-in fade-in slide-in-from-bottom-2 duration-300",
                                m.role === "user" ? "justify-end" : "justify-start"
                            )}
                        >
                            {m.role === "assistant" && (
                                <div className="flex-shrink-0 size-8 rounded-full bg-primary/20 flex items-center justify-center mt-1">
                                    <Bot className="size-4 text-primary" />
                                </div>
                            )}
                            <div
                                className={cn(
                                    "max-w-[85%] sm:max-w-[75%] rounded-2xl px-4 py-3.5 shadow-sm",
                                    m.role === "user"
                                        ? "bg-primary text-primary-foreground rounded-tr-sm"
                                        : "bg-card border border-border/50 rounded-tl-sm text-foreground"
                                )}
                            >
                                <div
                                    className={cn(
                                        "prose prose-sm max-w-none",
                                        m.role === "user"
                                            ? "text-primary-foreground [&_*]:text-primary-foreground"
                                            : ""
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
                                <div className="flex-shrink-0 size-8 rounded-full bg-secondary flex items-center justify-center mt-1">
                                    <User className="size-4 text-secondary-foreground" />
                                </div>
                            )}
                        </div>
                    ))}

                    {/* Suggested Questions — shown only before first user message */}
                    {messages.length === 0 && (
                        <div className="flex flex-wrap gap-2 mt-2">
                            {suggestedQuestions.map((q, i) => (
                                <button
                                    key={i}
                                    onClick={async () => {
                                        setInput("");
                                        await sendMessage({ text: q });
                                    }}
                                    className="text-xs px-3 py-2 rounded-full border border-border/60 bg-card/60 text-muted-foreground hover:text-foreground hover:border-primary/40 hover:bg-primary/5 transition-all"
                                >
                                    {q}
                                </button>
                            ))}
                        </div>
                    )}

                    {/* Streaming indicator */}
                    {isStreaming && displayMessages[displayMessages.length - 1]?.role === "user" && (
                        <div className="flex gap-3 w-full animate-in fade-in">
                            <div className="flex-shrink-0 size-8 rounded-full bg-primary/20 flex items-center justify-center">
                                <Bot className="size-4 text-primary" />
                            </div>
                            <div className="bg-card border border-border/50 rounded-2xl rounded-tl-sm px-4 py-3.5 flex items-center gap-2">
                                <Loader2 className="size-4 animate-spin text-muted-foreground" />
                                <span className="text-sm text-muted-foreground font-medium">Thinking...</span>
                            </div>
                        </div>
                    )}

                    {/* Error state */}
                    {error && (
                        <div className="flex gap-3 w-full animate-in fade-in">
                            <div className="flex-shrink-0 size-8 rounded-full bg-destructive/20 flex items-center justify-center">
                                <Bot className="size-4 text-destructive" />
                            </div>
                            <div className="bg-destructive/10 border border-destructive/20 rounded-2xl rounded-tl-sm px-4 py-3.5">
                                <p className="text-sm text-destructive font-medium">
                                    Something went wrong. Please try asking again.
                                </p>
                            </div>
                        </div>
                    )}

                    {/* Scroll anchor */}
                    <div ref={messagesEndRef} />
                </div>
            </main>

            {/* ── Input (flex-shrink-0, part of the flex column — never overlaps messages) ── */}
            <div className="flex-shrink-0 border-t border-border/50 bg-background px-4 sm:px-6 pt-3 pb-[max(1.25rem,env(safe-area-inset-bottom))]">
                <div className="max-w-2xl mx-auto">
                    <form
                        onSubmit={onSubmit}
                        className="relative flex items-end gap-2 bg-card rounded-2xl border border-border/60 shadow-sm overflow-hidden focus-within:border-primary/50 focus-within:ring-1 focus-within:ring-primary/50 transition-all"
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
                                    onSubmit();
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
                    <p className="text-[0.6rem] text-muted-foreground opacity-50 text-center mt-2">
                        AI persona · Responses are generated, not from the actual author
                    </p>
                </div>
            </div>
        </div>,
        document.body
    );
}
