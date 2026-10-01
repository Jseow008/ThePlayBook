"use client";

import { EvidenceCitations } from "@/components/evidence/EvidenceCitations";
import { getMessageCitations, isExactQuotation, type CitationLink } from "@/lib/evidence-citation";
import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import ReactMarkdown from "react-markdown";
import { useReliableChat as useChat } from "@/hooks/useReliableChat";
import { DefaultChatTransport, type UIMessage } from "ai";
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
import { ChatExportButton } from "@/components/chat/ChatExportButton";
import { serializeNotesChatScope, type NotesChatScopePayload } from "@/lib/notes-chat-scope";
import {
    clearNotesChatSession,
    readNotesChatSession,
    writeNotesChatSession,
} from "@/lib/notes-chat-session";
import { useVerifiedChatSession } from "@/hooks/useVerifiedChatSession";
import { useChatAutoScroll } from "@/hooks/useChatAutoScroll";

function notesRequestStatus(status: string) {
    return status === "streaming" ? "Receiving your response…" : "Searching your saved notes…";
}

/** Elapsed client wait only: no estimated completion time or inferred provider phase. */
function NotesRequestProgress({ status }: { status: string }) {
    const [startedAt] = useState(() => performance.now());
    const [elapsedSeconds, setElapsedSeconds] = useState(0);
    useEffect(() => {
        const timer = window.setInterval(() => setElapsedSeconds(Math.floor((performance.now() - startedAt) / 1000)), 1000);
        return () => window.clearInterval(timer);
    }, [startedAt]);
    return (
        <div data-testid="notes-request-progress" className="min-w-0 text-sm text-muted-foreground">
            <p className="font-medium">{notesRequestStatus(status)}</p>
            <p className="mt-1 text-xs">Results appear after evidence checks finish.</p>
            <p aria-hidden="true" className="mt-1 text-xs tabular-nums">{elapsedSeconds}s elapsed</p>
        </div>
    );
}

const chatTransport = new DefaultChatTransport({ api: "/api/chat/notes", headers: { "x-evidence-protocol": "ui" } });

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
                    {scope.scope ? "Matching saved captures" : "Adjust Notes filters"}
                </span>
                {scopeTokens.map((token) => (
                    <span
                        key={token}
                        className="rounded-full border border-border/60 bg-card/45 px-2.5 py-1 text-[0.68rem] text-foreground/85"
                    >
                        {token}
                    </span>
                ))}
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
                        Your filters changed. This chat still searches using its earlier filters.
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

export function NotesAskPanel(props: NotesAskPanelProps) {
    const { ownerKey, isCurrent, resolved } = useVerifiedChatSession();
    if (!ownerKey) return <p role="status" className="p-4 text-sm text-muted-foreground">{resolved ? <Link href="/login">Sign in to start a private chat.</Link> : "Verifying your chat session…"}</p>;
    return <VerifiedNotesAskPanel key={ownerKey} {...props} ownerKey={ownerKey} isCurrent={isCurrent} />;
}

function VerifiedNotesAskPanel({
    currentScope,
    onClose,
    mobile = false,
    variant = "default",
    ownerKey,
    isCurrent,
}: NotesAskPanelProps & { ownerKey: string; isCurrent: (key: string) => boolean }) {
    const pathname = usePathname();
    const searchParams = useSearchParams();
    const [input, setInput] = useState("");
    const [showAllStarterPrompts, setShowAllStarterPrompts] = useState(false);
    const [activeScope, setActiveScope] = useState<NotesChatScope>(currentScope);
    const chatInstanceId = useId();
    const [chatGeneration, setChatGeneration] = useState(0);
    const textareaRef = useRef<HTMLTextAreaElement>(null);
    const hasHydratedSessionRef = useRef(false);

    const {
        messages,
        completedMessages,
        sendMessage,
        setMessages,
        status,
        error,
        regenerate,
        stop,
    } = useChat<UIMessage>({
        id: `${chatInstanceId}:${chatGeneration}`,
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

        const restoredSession = readNotesChatSession(ownerKey, currentScope.signature);
        if (restoredSession) {
            setActiveScope(restoredSession.activeScope);
            setMessages(restoredSession.messages);
        } else {
            setActiveScope(currentScope);
        }

        hasHydratedSessionRef.current = true;
    }, [currentScope, setMessages, ownerKey]);

    useEffect(() => {
        if (!(variant === "sidebar" && !mobile) || messages.length > 0) {
            setShowAllStarterPrompts(false);
        }
    }, [activeScope.signature, messages.length, mobile, variant]);

    useEffect(() => {
        if (!hasHydratedSessionRef.current) {
            return;
        }

        if (!isCurrent(ownerKey)) return;

        if (messages.length === 0) {
            clearNotesChatSession(ownerKey, currentScope.signature);
            return;
        }

        writeNotesChatSession(ownerKey, {
            activeScope,
            messages: completedMessages,
            updatedAt: Date.now(),
        });
    }, [activeScope, currentScope.signature, completedMessages, messages.length, ownerKey, isCurrent]);

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
    const notesLabel = activeScope.scope ? "Matching saved captures" : "Adjust Notes filters";
    const composerPlaceholder = activeScope.invalidReason || "Ask about saved captures matching this scope…";
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
        if (!trimmed || isStreaming || !activeScope.scope || !isCurrent(ownerKey)) {
            return;
        }

        setInput("");
        if (textareaRef.current) {
            textareaRef.current.style.height = "auto";
        }
        scrollToBottom();

        await sendMessage(
            { text: trimmed },
            {
                body: {
                    scope: activeScope.scope,
                    scopeLabel: activeScope.summary,
                },
            }
        );
    };

    const retry = async () => {
        if (isStreaming || !activeScope.scope || !isCurrent(ownerKey)) return;
        await regenerate({ body: { scope: activeScope.scope, scopeLabel: activeScope.summary } });
    };

    const onSubmit = async (event?: FormEvent) => {
        event?.preventDefault();
        await sendPrompt(input);
    };

    const syncToCurrentScope = () => {
        // A cleared message array does not stop SDK stream writes. Abort the old
        // request and replace its Chat instance so even queued late chunks stay
        // attached to the old scope rather than the newly selected transcript.
        void stop?.();
        setActiveScope(currentScope);
        setMessages([]);
        setChatGeneration((generation) => generation + 1);
    };

    const startNewChat = () => {
        clearNotesChatSession(ownerKey, [activeScope.signature, currentScope.signature]);
        setInput("");
        setShowAllStarterPrompts(false);
        syncToCurrentScope();

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

    const displayMessages: Array<{ id: string; role: string; content: string; citations: CitationLink[]; exactQuotation: boolean }> = messages.map((message) => ({
        id: message.id,
        role: message.role,
            citations: getMessageCitations(message),
            exactQuotation: isExactQuotation(message),
        content: getMessageText(message),
    }));
    const lastDisplayMessage = displayMessages[displayMessages.length - 1];
    const {
        containerRef: messagesContainerRef,
        endRef: messagesEndRef,
        scrollToBottom,
    } = useChatAutoScroll<HTMLDivElement>({
        messageCount: displayMessages.length,
        lastMessageId: lastDisplayMessage?.id,
        lastMessageTextLength: lastDisplayMessage?.content.length ?? 0,
        status,
    });

    const latestQuestionId = [...displayMessages].reverse().find((message) => message.role === "user")?.id;
    const awaitingResponseText = isStreaming && (lastDisplayMessage?.role !== "assistant" || !lastDisplayMessage.content.trim());

    const latestAssistantMessageId = [...displayMessages]
        .reverse()
        .find((message) => message.role === "assistant")?.id;
    // Announce state changes once, not every streamed token, without moving focus.
    const responseStatus = (
        <p role="status" aria-label="Notes response status" aria-live="polite" aria-atomic="true" className="sr-only">
            {isStreaming ? notesRequestStatus(status)
                : error ? `Request failed. ${displayErrorMessage}`
                    : latestAssistantMessageId ? "Response ready. Review it in the Notes conversation." : ""}
        </p>
    );
    const exportButton = !isEmptyState ? (
        <ChatExportButton
            title="Ask These Notes"
            assistantLabel="Ask These Notes"
            scopeSummary={activeScope.summary}
            messages={displayMessages}
            disabled={isStreaming || Boolean(error) || !activeScope.scope}
            className={isSidebar ? "px-3 py-1.5 text-[0.72rem]" : undefined}
        />
    ) : null;

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
                        {responseStatus}
                        <div ref={messagesContainerRef} role="region" aria-label="Notes conversation" tabIndex={0} className="min-h-0 flex-1 overflow-y-auto pr-1 [overflow-anchor:none]">
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
                                                            disabled={isStreaming || !activeScope.scope}
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
                                        !isStreaming && !error
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
                                                            "prose prose-sm max-w-none [&_pre]:whitespace-pre-wrap [&_pre]:[overflow-wrap:anywhere]",
                                                            message.role === "user"
                                                                ? "text-primary-foreground [&_*]:text-primary-foreground"
                                                                : "leading-[1.6] text-[0.92rem] text-foreground/95 [&_p]:my-0 [&_p+p]:mt-4 sm:max-w-[70ch] sm:text-[0.98rem] sm:leading-7"
                                                        )}
                                                    >
                                                        {message.role === "user" ? (
                                                            <p className="m-0 leading-[1.55] text-[0.9rem] sm:text-[0.95rem]">{message.content}</p>
                                                        ) : (
                                                            <>{message.exactQuotation ? <p className="whitespace-pre-wrap [overflow-wrap:anywhere]">{message.content}</p> : <ReactMarkdown>{message.content}</ReactMarkdown>}<EvidenceCitations citations={message.citations} /></>
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

                                {awaitingResponseText && (
                                    <div className="flex w-full gap-3 animate-in fade-in">
                                        <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary/20">
                                            <Bot className="size-4 text-primary" />
                                        </div>
                                        <div className="flex items-center gap-2 rounded-2xl rounded-tl-sm border border-border/50 bg-card px-4 py-3.5">
                                            <Loader2 className="size-4 animate-spin text-muted-foreground" />
                                            <NotesRequestProgress key={latestQuestionId} status={status} />
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
                                            <button type="button" onClick={() => void retry()} className="mt-2 text-sm font-medium underline underline-offset-4" disabled={isStreaming}>Try again</button>
                                        </div>
                                    </div>
                                )}

                                <div ref={messagesEndRef} />
                            </div>
                        </div>
                    </div>
                </div>

                <div className="flex-shrink-0 bg-gradient-to-b from-transparent via-background/90 to-background/95 px-0 pt-4 safe-area-pb-lg sm:px-0">
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
                            </div>
                            <div className="flex items-center gap-2">
                                {exportButton}
                                <span className="hidden text-[0.65rem] text-muted-foreground/75 sm:inline">
                                    Enter to send · Shift+Enter for newline
                                </span>
                            </div>
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
                                disabled={isStreaming || !activeScope.scope}
                            />
                            <div className="mb-2 mr-2">
                                <button
                                    type="submit"
                                    disabled={!input.trim() || isStreaming || !activeScope.scope}
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
                            { "Notes-scoped assistant · Grounded only in the notes currently in scope."}
                        </p>
                    </div>
                </div>
            </section>
        );
    }

    return (
        <section
            data-testid={isSidebar ? "notes-ask-sidebar-panel" : "notes-ask-panel"}
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

                        <div className="flex items-center gap-2">
                            {!isEmptyState && (
                                <ChatExportButton
                                    title="Ask These Notes"
                                    assistantLabel="Ask These Notes"
                                    scopeSummary={activeScope.summary}
                                    messages={displayMessages}
                                    disabled={isStreaming || !activeScope.scope}
                                    variant="icon"
                                />
                            )}
                            <Link
                                href={fullScreenHref}
                                className={sidebarUtilityActionClassName}
                                aria-label="Open Ask These Notes in full screen"
                                title="Open full screen"
                            >
                                <Expand className="size-4" />
                            </Link>
                        </div>
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
                            {exportButton}
                            {!isEmptyState && (
                                <button
                                    type="button"
                                    onClick={startNewChat}
                                    disabled={isStreaming || !activeScope.scope}
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

            {responseStatus}
            <div
                ref={messagesContainerRef} role="region" aria-label="Notes conversation" tabIndex={0}
                className={cn(
                "min-h-0 flex-1 overflow-y-auto px-4 py-4 [overflow-anchor:none]",
                isSidebar && "px-5 py-5"
                )}
            >
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
                                                disabled={isStreaming || !activeScope.scope}
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
                            !isStreaming && !error
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
                                                "prose prose-sm max-w-none [&_pre]:whitespace-pre-wrap [&_pre]:[overflow-wrap:anywhere]",
                                                message.role === "user"
                                                    ? "text-primary-foreground [&_*]:text-primary-foreground"
                                                    : "leading-7 text-[0.94rem] text-foreground/95 [&_p]:my-0 [&_p+p]:mt-4"
                                            )}
                                        >
                                            {message.role === "user" ? (
                                                <p className="m-0 leading-relaxed text-[0.92rem]">{message.content}</p>
                                            ) : (
                                                <>{message.exactQuotation ? <p className="whitespace-pre-wrap [overflow-wrap:anywhere]">{message.content}</p> : <ReactMarkdown>{message.content}</ReactMarkdown>}<EvidenceCitations citations={message.citations} /></>
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

                    {awaitingResponseText && (
                        <div className="flex w-full gap-3 animate-in fade-in">
                            <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary/20">
                                <Bot className="size-4 text-primary" />
                            </div>
                            <div className="flex items-center gap-2 rounded-2xl rounded-tl-sm border border-border/50 bg-card px-4 py-3">
                                <Loader2 className="size-4 animate-spin text-muted-foreground" />
                                <NotesRequestProgress key={latestQuestionId} status={status} />
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
                                <button type="button" onClick={() => void retry()} className="mt-2 text-sm font-medium underline underline-offset-4" disabled={isStreaming}>Try again</button>
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
                "shrink-0 border-t border-border/45 bg-card/30 px-3 pt-3 pb-[max(0.85rem,var(--safe-area-bottom))]",
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
                    </div>
                    {isSidebar && !isEmptyState ? (
                        <button
                            type="button"
                            onClick={startNewChat}
                            disabled={isStreaming || !activeScope.scope}
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
                        disabled={isStreaming || !activeScope.scope}
                    />
                    <div className="mb-2 mr-2">
                        <button
                            type="submit"
                            disabled={!input.trim() || isStreaming || !activeScope.scope}
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
                    { isSidebar
                            ? "Grounded only in the notes currently in scope."
                            : "Notes-scoped assistant · grounded only in the notes currently in scope."}
                </p>
            </div>
        </section>
    );
}
