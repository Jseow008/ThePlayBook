"use client";

import { useMemo, useRef, useEffect, useState, type FormEvent } from "react";
import { useChat } from "@ai-sdk/react";
import { TextStreamChatTransport } from "ai";
import { Bot, User, Send, BotMessageSquare, Loader2, BookOpen, ArrowLeft, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";
import ReactMarkdown from "react-markdown";
import Link from "next/link";
import { useInfiniteHighlights, type HighlightsPage } from "@/hooks/useHighlights";
import { NotesAskPanel, type NotesChatScope } from "@/components/notes/NotesAskPanel";
import type { LibrarySnapshot } from "@/lib/server/library-snapshot";

const chatTransport = new TextStreamChatTransport({ api: "/api/chat" });

const FALLBACK_CHAT_ERROR = "Something went wrong. Please try asking again.";

const STARTER_PROMPTS = [
    "What have I completed in my library?",
    "Which authors show up most in my saved books?",
    "Which saved book is most relevant to discipline, and why?",
    "What themes show up across my saved books?",
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

function getMessageText(message: {
    parts?: Array<{ type: string; text?: string }>;
    content?: unknown;
}): string {
    const partsText = message.parts
        ?.filter((part): part is { type: "text"; text: string } =>
            part.type === "text" && typeof part.text === "string"
        )
        .map((part) => part.text)
        .join("") || "";

    if (partsText) {
        return partsText;
    }

    return typeof message.content === "string" ? message.content : "";
}

function useIsDesktop() {
    const [isDesktop, setIsDesktop] = useState(false);

    useEffect(() => {
        const mediaQuery = window.matchMedia("(min-width: 1024px)");
        const update = () => setIsDesktop(mediaQuery.matches);

        update();
        mediaQuery.addEventListener("change", update);

        return () => {
            mediaQuery.removeEventListener("change", update);
        };
    }, []);

    return isDesktop;
}

interface AskClientPageProps {
    returnTo?: string;
    scope?: "library" | "notes";
    initialNotesPage?: HighlightsPage;
    initialNotesScope?: NotesChatScope;
    initialLibrarySnapshot?: LibrarySnapshot;
}

export function AskClientPage({
    returnTo,
    scope = "library",
    initialNotesPage,
    initialNotesScope,
    initialLibrarySnapshot,
}: AskClientPageProps) {
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
    const hasMountedRef = useRef(false);
    const previousMessageCountRef = useRef(0);
    const previousStatusRef = useRef<string | null>(null);
    const isDesktop = useIsDesktop();
    const resolvedScope = scope;

    const {
        data: notesData,
        isLoading: isNotesLoading,
        isError: isNotesError,
    } = useInfiniteHighlights(undefined, {
        initialPage: initialNotesPage,
        enabled: resolvedScope === "notes" && !initialNotesScope,
    });

    useEffect(() => {
        const previousMessageCount = previousMessageCountRef.current;
        const previousStatus = previousStatusRef.current;
        const hasMessages = messages.length > 0;
        const hasNewMessage = messages.length > previousMessageCount;
        const isStreamingUpdate =
            hasMessages
            && status === "streaming"
            && previousStatus !== "streaming";

        if (resolvedScope === "library" && hasMountedRef.current && (hasNewMessage || isStreamingUpdate)) {
            messagesEndRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
        }

        hasMountedRef.current = true;
        previousMessageCountRef.current = messages.length;
        previousStatusRef.current = status;
    }, [messages.length, resolvedScope, status]);

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

    const displayMessages: Array<{ id: string; role: string; content: string }> = messages.map((message) => ({
        id: message.id,
        role: message.role,
        content: getMessageText(message as { parts?: Array<{ type: string; text?: string }>; content?: unknown }),
    }));

    const latestAssistantMessageId = [...displayMessages]
        .reverse()
        .find((message) => message.role === "assistant")?.id;
    const isEmptyState = displayMessages.length === 0;
    const backHref = returnTo || "/";
    const backLabel = returnTo ? "Back to notes" : "Back to home";

    const noteHighlights = useMemo(
        () => notesData?.pages.flatMap((page) => page.data) ?? initialNotesPage?.data ?? [],
        [initialNotesPage?.data, notesData]
    );

    const notesChatScope = useMemo<NotesChatScope>(() => {
        if (initialNotesScope) {
            return initialNotesScope;
        }

        const scopedHighlights = noteHighlights.slice(0, 40);

        return {
            highlightIds: scopedHighlights.map((item) => item.id),
            noteCount: scopedHighlights.length,
            totalMatches: noteHighlights.length,
            summary: "All content",
            signature: JSON.stringify({
                ids: scopedHighlights.map((item) => item.id),
                totalMatches: noteHighlights.length,
                scope: "notes",
            }),
        };
    }, [initialNotesScope, noteHighlights]);

    const mobileLibraryHref = useMemo(() => {
        const params = new URLSearchParams();
        if (returnTo) params.set("returnTo", returnTo);
        return params.size > 0 ? `/ask?${params.toString()}` : "/ask";
    }, [returnTo]);

    const mobileNotesHref = useMemo(() => {
        const params = new URLSearchParams();
        params.set("scope", "notes");
        if (returnTo) params.set("returnTo", returnTo);
        return `/ask?${params.toString()}`;
    }, [returnTo]);

    const showMobileAskNav = !isDesktop;
    const isLibraryScope = resolvedScope === "library";
    const pageTitle = isLibraryScope ? "Ask My Library" : "Ask These Notes";
    const pageSubtitle = isLibraryScope
        ? "Answers grounded in your library, reading history, and saved book content"
        : "Answers grounded in the notes currently in scope";

    return (
        <div className="flex h-[100dvh] flex-col bg-background">
            <header className="flex-shrink-0 border-b border-border/50 px-4 py-3 sm:px-6">
                <div className="mx-auto flex w-full max-w-4xl items-center justify-between gap-4">
                    <div className="flex min-w-0 items-center gap-3">
                        <Link
                            href={backHref}
                            className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-muted/60 transition-colors hover:bg-muted"
                            aria-label={backLabel}
                        >
                            <ArrowLeft className="size-4 text-muted-foreground" />
                        </Link>
                        <div className="flex size-10 shrink-0 items-center justify-center rounded-2xl border border-primary/20 bg-primary/10">
                            <BotMessageSquare className="size-4 text-primary" />
                        </div>
                        <div className="min-w-0">
                            <h1 className="truncate text-sm font-bold leading-tight text-foreground sm:text-base">{pageTitle}</h1>
                            <p className="truncate text-xs text-foreground/80">{pageSubtitle}</p>
                            {isLibraryScope && (
                                <p className="mt-0.5 truncate text-[0.65rem] leading-none text-muted-foreground">Library Assistant &middot; AI Search</p>
                            )}
                            {isLibraryScope && initialLibrarySnapshot && (
                                <div className="mt-2 flex flex-wrap gap-1.5 text-[0.65rem] text-muted-foreground">
                                    <span className="rounded-full border border-border/60 bg-card/50 px-2 py-0.5">
                                        {initialLibrarySnapshot.totalItems} in library
                                    </span>
                                    <span className="rounded-full border border-border/60 bg-card/50 px-2 py-0.5">
                                        {initialLibrarySnapshot.completedCount} completed
                                    </span>
                                    <span className="rounded-full border border-border/60 bg-card/50 px-2 py-0.5">
                                        {initialLibrarySnapshot.inProgressCount} in progress
                                    </span>
                                    <span className="rounded-full border border-border/60 bg-card/50 px-2 py-0.5">
                                        {initialLibrarySnapshot.savedButNotStartedCount} saved but not started
                                    </span>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            </header>

            {showMobileAskNav && (
                <div className="sticky top-0 z-30 border-b border-border/70 bg-background/90 backdrop-blur-md lg:hidden overflow-x-auto scrollbar-hide">
                    <div className="flex h-12 min-w-max items-center gap-2 px-4">
                        <Link
                            href={mobileLibraryHref}
                            className={cn(
                                "rounded-full px-4 py-1.5 text-sm font-medium whitespace-nowrap transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
                                isLibraryScope
                                    ? "bg-primary text-primary-foreground shadow-sm"
                                    : "text-muted-foreground hover:bg-secondary/60 hover:text-foreground"
                            )}
                            aria-current={isLibraryScope ? "page" : undefined}
                        >
                            Ask My Library
                        </Link>
                        <Link
                            href={mobileNotesHref}
                            className={cn(
                                "rounded-full px-4 py-1.5 text-sm font-medium whitespace-nowrap transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
                                !isLibraryScope
                                    ? "bg-primary text-primary-foreground shadow-sm"
                                    : "text-muted-foreground hover:bg-secondary/60 hover:text-foreground"
                            )}
                            aria-current={!isLibraryScope ? "page" : undefined}
                        >
                            Ask These Notes
                        </Link>
                    </div>
                </div>
            )}

            {isLibraryScope ? (
                <>
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
                                                            Ask across your reading life
                                                        </p>
                                                        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted-foreground sm:text-[0.95rem]">
                                                            Ask about completed books, saved titles, recurring authors, and the ideas inside the passages you&apos;ve kept. Ask My Library can answer both library-inventory questions and content-grounded synthesis questions.
                                                        </p>
                                                        {initialLibrarySnapshot && (
                                                            <div className="mt-4 grid gap-2 text-xs text-muted-foreground sm:grid-cols-2">
                                                                <div className="rounded-2xl border border-border/60 bg-background/60 px-3 py-2">
                                                                    <span className="font-medium text-foreground">{initialLibrarySnapshot.totalItems}</span> items currently in your library
                                                                </div>
                                                                <div className="rounded-2xl border border-border/60 bg-background/60 px-3 py-2">
                                                                    <span className="font-medium text-foreground">{initialLibrarySnapshot.completedCount}</span> completed
                                                                </div>
                                                                <div className="rounded-2xl border border-border/60 bg-background/60 px-3 py-2">
                                                                    <span className="font-medium text-foreground">{initialLibrarySnapshot.inProgressCount}</span> in progress
                                                                </div>
                                                                <div className="rounded-2xl border border-border/60 bg-background/60 px-3 py-2">
                                                                    <span className="font-medium text-foreground">{initialLibrarySnapshot.savedButNotStartedCount}</span> saved but not started
                                                                </div>
                                                            </div>
                                                        )}
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

                                        {displayMessages.map((message) => {
                                            const showFollowUpActions = !isStreaming && message.role === "assistant" && message.id === latestAssistantMessageId;

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
                                                                        : "leading-7 text-[0.98rem] text-foreground/95 [&_p]:my-0 [&_p+p]:mt-4 sm:max-w-[70ch]"
                                                                )}
                                                            >
                                                                {message.role === "user" ? (
                                                                    <p className="m-0 leading-relaxed text-[0.95rem]">{message.content}</p>
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
                                        Powered by Anthropic + Gemini · grounded in your library metadata, reading history, and saved passages when relevant.
                                    </p>
                                </div>
                            </div>
                        </div>
                    </div>
                </>
            ) : (
                <main className="flex-1 overflow-y-auto overscroll-contain">
                    <div className="mx-auto flex min-h-full w-full max-w-5xl flex-col px-0 pb-[max(1rem,env(safe-area-inset-bottom))] sm:px-6 sm:pt-6">
                        {isNotesLoading && noteHighlights.length === 0 ? (
                            <div className="flex flex-1 items-center justify-center px-4 py-12">
                                <div className="flex items-center gap-3 text-sm text-muted-foreground">
                                    <Loader2 className="size-4 animate-spin" />
                                    <span>Loading your notes...</span>
                                </div>
                            </div>
                        ) : isNotesError ? (
                            <div className="flex flex-1 items-center justify-center px-4 py-12">
                                <div className="rounded-2xl border border-destructive/20 bg-destructive/10 px-5 py-4 text-sm text-destructive">
                                    Failed to load notes for Ask These Notes.
                                </div>
                            </div>
                        ) : (
                            <NotesAskPanel
                                currentScope={notesChatScope}
                                onClose={() => {}}
                                variant="page"
                            />
                        )}
                    </div>
                </main>
            )}
        </div>
    );
}
