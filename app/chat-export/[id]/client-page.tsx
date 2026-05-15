"use client";

import { useEffect, useMemo, useState } from "react";
import ReactMarkdown from "react-markdown";
import { AlertTriangle, Download, Loader2, LockKeyhole } from "lucide-react";
import {
    buildChatExportMarkdown,
    getChatExportFilename,
    type ChatExportPayload,
    type EncryptedChatExportPayload,
} from "@/lib/chat-export";
import { decryptChatExport } from "@/lib/chat-export-crypto";
import { cn } from "@/lib/utils";

interface ChatExportClientPageProps {
    exportId: string;
}

type ExportPageState =
    | { status: "loading" }
    | { status: "ready"; payload: ChatExportPayload; expiresAt: string }
    | { status: "expired" }
    | { status: "error"; message: string };

function getKeyFromHash(): string | null {
    const params = new URLSearchParams(window.location.hash.replace(/^#/, ""));
    return params.get("key");
}

function downloadMarkdown(payload: ChatExportPayload) {
    const markdown = buildChatExportMarkdown(payload);
    const blob = new Blob([markdown], { type: "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");

    link.href = url;
    link.download = getChatExportFilename(payload);
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
}

function formatCreatedAt(value: string): string {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? "Unknown time" : date.toLocaleString();
}

export function ChatExportClientPage({ exportId }: ChatExportClientPageProps) {
    const [state, setState] = useState<ExportPageState>({ status: "loading" });

    useEffect(() => {
        let cancelled = false;

        const loadExport = async () => {
            const key = getKeyFromHash();
            if (!key) {
                setState({ status: "error", message: "This export link is missing its decryption key." });
                return;
            }

            try {
                const response = await fetch(`/api/chat/exports/${exportId}`, { cache: "no-store" });
                if (response.status === 410) {
                    setState({ status: "expired" });
                    return;
                }

                if (!response.ok) {
                    throw new Error("Could not load this chat export.");
                }

                const body = await response.json() as {
                    payload: EncryptedChatExportPayload;
                    expiresAt: string;
                };
                const payload = await decryptChatExport(body.payload, key);

                if (!cancelled) {
                    setState({ status: "ready", payload, expiresAt: body.expiresAt });
                }
            } catch {
                if (!cancelled) {
                    setState({ status: "error", message: "This export could not be decrypted." });
                }
            }
        };

        void loadExport();

        return () => {
            cancelled = true;
        };
    }, [exportId]);

    const readyPayload = state.status === "ready" ? state.payload : null;
    const scopeMeta = useMemo(() => {
        if (!readyPayload) {
            return [];
        }

        return [
            readyPayload.scopeSummary ? `Scope: ${readyPayload.scopeSummary}` : null,
            typeof readyPayload.noteCount === "number" ? `${readyPayload.noteCount} notes in scope` : null,
            `${readyPayload.messages.length} messages`,
        ].filter(Boolean);
    }, [readyPayload]);

    return (
        <main className="min-h-[100dvh] bg-background px-4 py-6 text-foreground sm:px-6 sm:py-10">
            <div className="mx-auto w-full max-w-3xl">
                {state.status === "loading" && (
                    <div className="flex min-h-[70dvh] flex-col items-center justify-center text-muted-foreground">
                        <Loader2 className="size-6 animate-spin" />
                        <p className="mt-3 text-sm font-medium">Opening encrypted export...</p>
                    </div>
                )}

                {state.status === "expired" && (
                    <div className="flex min-h-[70dvh] flex-col items-center justify-center text-center">
                        <div className="flex size-12 items-center justify-center rounded-2xl border border-border/60 bg-card/65">
                            <AlertTriangle className="size-5 text-muted-foreground" />
                        </div>
                        <h1 className="mt-5 text-xl font-semibold text-foreground">Export expired</h1>
                        <p className="mt-2 max-w-sm text-sm leading-relaxed text-muted-foreground">
                            This QR export was available for 30 minutes and has been deleted.
                        </p>
                    </div>
                )}

                {state.status === "error" && (
                    <div className="flex min-h-[70dvh] flex-col items-center justify-center text-center">
                        <div className="flex size-12 items-center justify-center rounded-2xl border border-border/60 bg-card/65">
                            <LockKeyhole className="size-5 text-muted-foreground" />
                        </div>
                        <h1 className="mt-5 text-xl font-semibold text-foreground">Export unavailable</h1>
                        <p className="mt-2 max-w-sm text-sm leading-relaxed text-muted-foreground">
                            {state.message}
                        </p>
                    </div>
                )}

                {state.status === "ready" && (
                    <article className="rounded-[28px] border border-border/50 bg-card/40 shadow-[0_0_0_1px_rgba(255,255,255,0.02)] backdrop-blur-sm">
                        <header className="border-b border-border/45 px-5 py-5 sm:px-7">
                            <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                                <div className="min-w-0">
                                    <h1 className="text-xl font-semibold leading-tight text-foreground sm:text-2xl">
                                        {state.payload.title}
                                    </h1>
                                    <p className="mt-2 text-sm text-muted-foreground">
                                        Created {formatCreatedAt(state.payload.createdAt)}
                                    </p>
                                </div>
                                <button
                                    type="button"
                                    onClick={() => downloadMarkdown(state.payload)}
                                    className="inline-flex shrink-0 items-center justify-center gap-2 rounded-xl border border-border/65 bg-background/55 px-3.5 py-2.5 text-sm font-semibold text-foreground transition-colors hover:bg-background"
                                >
                                    <Download className="size-4" />
                                    Markdown
                                </button>
                            </div>

                            {scopeMeta.length > 0 && (
                                <div className="mt-4 flex flex-wrap gap-2">
                                    {scopeMeta.map((item) => (
                                        <span
                                            key={item}
                                            className="rounded-full border border-border/65 bg-background/45 px-2.5 py-1 text-[0.68rem] font-medium text-foreground/82"
                                        >
                                            {item}
                                        </span>
                                    ))}
                                </div>
                            )}
                        </header>

                        <div className="space-y-5 px-4 py-5 sm:px-7 sm:py-7">
                            {state.payload.messages.map((message, index) => (
                                <section
                                    key={message.id ?? `${message.role}-${index}`}
                                    className={cn(
                                        "rounded-2xl border px-4 py-4",
                                        message.role === "user"
                                            ? "border-primary/20 bg-primary/10"
                                            : "border-border/45 bg-background/45"
                                    )}
                                >
                                    <p className="mb-3 text-[0.68rem] font-semibold uppercase tracking-[0.18em] text-muted-foreground/85">
                                        {message.role === "user" ? "You" : state.payload.assistantLabel}
                                    </p>
                                    <div className="prose prose-sm max-w-none leading-7 text-foreground/94 [&_p]:my-0 [&_p+p]:mt-4">
                                        {message.role === "assistant" ? (
                                            <ReactMarkdown>{message.content}</ReactMarkdown>
                                        ) : (
                                            <p>{message.content}</p>
                                        )}
                                    </div>
                                </section>
                            ))}
                        </div>
                    </article>
                )}
            </div>
        </main>
    );
}
