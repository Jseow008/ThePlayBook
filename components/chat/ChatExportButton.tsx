"use client";

import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { Check, Copy, Download, Loader2, QrCode, RefreshCw, Share2, X } from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import { toast } from "sonner";
import {
    buildChatExportMarkdown,
    getChatExportFilename,
    type ChatExportMessage,
    type ChatExportPayload,
    type EncryptedChatExportPayload,
} from "@/lib/chat-export";
import { encryptChatExport } from "@/lib/chat-export-crypto";
import { captureAnalyticsEvent } from "@/lib/analytics";
import { cn } from "@/lib/utils";
import { useBodyScrollLock } from "@/hooks/useBodyScrollLock";

interface ChatExportButtonProps {
    title: string;
    assistantLabel: string;
    scopeSummary?: string;
    noteCount?: number;
    messages: Array<{ id?: string; role: string; content: string }>;
    disabled?: boolean;
    className?: string;
    variant?: "pill" | "icon";
}

type ExportState =
    | { status: "idle" }
    | { status: "creating" }
    | {
        status: "ready";
        url: string;
        expiresAt: string;
        payload: ChatExportPayload;
    }
    | { status: "error"; message: string }
    | { status: "expired"; payload?: ChatExportPayload };

function getExportableMessages(messages: ChatExportButtonProps["messages"]): ChatExportMessage[] {
    return messages
        .filter((message): message is ChatExportMessage =>
            (message.role === "user" || message.role === "assistant")
            && message.content.trim().length > 0
        )
        .map((message) => ({
            id: message.id,
            role: message.role,
            content: message.content,
        }));
}

function getRemainingLabel(expiresAt: string): string {
    const remainingMs = Math.max(0, new Date(expiresAt).getTime() - Date.now());
    const minutes = Math.floor(remainingMs / 60_000);
    const seconds = Math.ceil((remainingMs % 60_000) / 1000);

    return `${minutes}:${seconds.toString().padStart(2, "0")}`;
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

async function createRemoteExport(encrypted: EncryptedChatExportPayload, messageCount: number) {
    const response = await fetch("/api/chat/exports", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            payload: encrypted,
            messageCount,
        }),
    });

    if (!response.ok) {
        let apiMessage: string | null = null;
        try {
            const body = await response.json() as { error?: { message?: string } };
            apiMessage = body.error?.message ?? null;
        } catch {
            // Fall through to the generic message below.
        }

        throw new Error(apiMessage || "Could not create QR export.");
    }

    return await response.json() as { id: string; expiresAt: string };
}

export function ChatExportButton({
    title,
    assistantLabel,
    scopeSummary,
    noteCount,
    messages,
    disabled,
    className,
    variant = "pill",
}: ChatExportButtonProps) {
    const [mounted, setMounted] = useState(false);
    const [isOpen, setIsOpen] = useState(false);
    const [exportState, setExportState] = useState<ExportState>({ status: "idle" });
    const [remainingLabel, setRemainingLabel] = useState("30:00");
    const [copied, setCopied] = useState(false);
    const exportableMessages = useMemo(() => getExportableMessages(messages), [messages]);
    const isUnavailable = disabled || exportableMessages.length === 0;

    useEffect(() => {
        setMounted(true);
    }, []);

    useEffect(() => {
        if (!isOpen || exportState.status !== "ready") {
            return;
        }

        const updateCountdown = () => {
            if (new Date(exportState.expiresAt).getTime() <= Date.now()) {
                setExportState({ status: "expired", payload: exportState.payload });
                return;
            }

            setRemainingLabel(getRemainingLabel(exportState.expiresAt));
        };

        updateCountdown();
        const interval = window.setInterval(updateCountdown, 1000);

        return () => window.clearInterval(interval);
    }, [exportState, isOpen]);

    useBodyScrollLock(isOpen);

    const createExport = async () => {
        if (isUnavailable) {
            return;
        }

        setExportState({ status: "creating" });
        setCopied(false);

        try {
            const payload: ChatExportPayload = {
                version: 1,
                title,
                assistantLabel,
                scopeSummary,
                noteCount,
                createdAt: new Date().toISOString(),
                messages: exportableMessages,
            };
            const { encrypted, key } = await encryptChatExport(payload);
            const result = await createRemoteExport(encrypted, exportableMessages.length);
            const url = new URL(`/chat-export/${result.id}`, window.location.origin);
            url.hash = `key=${encodeURIComponent(key)}`;

            setRemainingLabel(getRemainingLabel(result.expiresAt));
            setExportState({
                status: "ready",
                url: url.toString(),
                expiresAt: result.expiresAt,
                payload,
            });
        } catch (error) {
            const message = error instanceof Error ? error.message : "Could not create QR export.";
            setExportState({ status: "error", message });
            toast.error(message);
        }
    };

    const openModal = () => {
        if (isUnavailable) {
            return;
        }

        setIsOpen(true);
        void createExport();
    };

    const copyLink = async () => {
        if (exportState.status !== "ready") {
            return;
        }

        try {
            await navigator.clipboard.writeText(exportState.url);
            setCopied(true);
            captureAnalyticsEvent("share_clicked", {
                source: "chat_export",
                share_method: "copy_link",
                share_target: "chat_export",
            });
            toast.success("Export link copied");
            window.setTimeout(() => setCopied(false), 1800);
        } catch {
            toast.error("Could not copy export link");
        }
    };

    const shareLink = async () => {
        if (exportState.status !== "ready") {
            return;
        }

        const shareData = {
            title: exportState.payload.title,
            text: "Open this temporary Netflux chat export.",
            url: exportState.url,
        };

        if (navigator.share && navigator.canShare?.(shareData)) {
            try {
                await navigator.share(shareData);
                captureAnalyticsEvent("share_clicked", {
                    source: "chat_export",
                    share_method: "native",
                    share_target: "chat_export",
                });
                return;
            } catch (error) {
                if (error instanceof Error && error.name === "AbortError") {
                    return;
                }
            }
        }

        await copyLink();
    };

    const modal = isOpen && mounted ? createPortal(
        <div className="fixed inset-0 z-[120] flex items-center justify-center bg-background/82 px-4 py-6 backdrop-blur-md">
            <div
                role="dialog"
                aria-modal="true"
                aria-labelledby="chat-export-title"
                className="w-full max-w-md rounded-[24px] border border-border/55 bg-card p-5 shadow-2xl animate-in fade-in zoom-in-95 duration-200"
            >
                <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0">
                        <h2 id="chat-export-title" className="text-base font-semibold text-foreground">
                            Export chat
                        </h2>
                        <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
                            This encrypted QR export expires in 30 minutes.
                        </p>
                    </div>
                    <button
                        type="button"
                        onClick={() => setIsOpen(false)}
                        className="flex size-9 shrink-0 items-center justify-center rounded-xl text-muted-foreground transition-colors hover:bg-background/70 hover:text-foreground"
                        aria-label="Close export dialog"
                    >
                        <X className="size-4" />
                    </button>
                </div>

                <div className="mt-5">
                    {exportState.status === "creating" && (
                        <div className="flex min-h-[18rem] flex-col items-center justify-center rounded-2xl border border-border/50 bg-background/45 text-muted-foreground">
                            <Loader2 className="size-5 animate-spin" />
                            <p className="mt-3 text-sm font-medium">Creating encrypted export...</p>
                        </div>
                    )}

                    {exportState.status === "ready" && (
                        <div className="space-y-4">
                            <div className="rounded-2xl border border-border/50 bg-white p-4">
                                <QRCodeSVG
                                    value={exportState.url}
                                    size={256}
                                    level="M"
                                    marginSize={2}
                                    className="h-auto w-full"
                                />
                            </div>
                            <div className="flex items-center justify-between gap-3 rounded-2xl border border-border/50 bg-background/45 px-3 py-2.5">
                                <span className="text-xs font-medium text-muted-foreground">
                                    Expires in
                                </span>
                                <span className="font-mono text-sm font-semibold text-foreground">
                                    {remainingLabel}
                                </span>
                            </div>
                            <div className="flex items-center justify-between gap-3 rounded-2xl border border-border/50 bg-background/45 px-3 py-2.5">
                                <span className="text-xs font-medium text-muted-foreground">
                                    Snapshot
                                </span>
                                <span className="text-xs font-semibold text-foreground">
                                    {new Date(exportState.payload.createdAt).toLocaleTimeString([], {
                                        hour: "numeric",
                                        minute: "2-digit",
                                    })}
                                </span>
                            </div>
                            <div className="grid grid-cols-3 gap-2">
                                <button
                                    type="button"
                                    onClick={shareLink}
                                    className="inline-flex min-w-0 items-center justify-center gap-1.5 rounded-xl border border-border/65 bg-background/55 px-2 py-2.5 text-xs font-semibold text-foreground transition-colors hover:bg-background"
                                >
                                    <Share2 className="size-4 shrink-0" />
                                    <span className="truncate">Share</span>
                                </button>
                                <button
                                    type="button"
                                    onClick={copyLink}
                                    className="inline-flex min-w-0 items-center justify-center gap-1.5 rounded-xl border border-border/65 bg-background/55 px-2 py-2.5 text-xs font-semibold text-foreground transition-colors hover:bg-background"
                                >
                                    {copied ? <Check className="size-4 shrink-0 text-primary" /> : <Copy className="size-4 shrink-0" />}
                                    <span className="truncate">Copy link</span>
                                </button>
                                <button
                                    type="button"
                                    onClick={() => {
                                        downloadMarkdown(exportState.payload);
                                        captureAnalyticsEvent("share_clicked", {
                                            source: "chat_export",
                                            share_method: "download",
                                            share_target: "markdown",
                                        });
                                    }}
                                    className="inline-flex min-w-0 items-center justify-center gap-1.5 rounded-xl border border-border/65 bg-background/55 px-2 py-2.5 text-xs font-semibold text-foreground transition-colors hover:bg-background"
                                >
                                    <Download className="size-4 shrink-0" />
                                    <span className="truncate">Markdown</span>
                                </button>
                            </div>
                            <button
                                type="button"
                                onClick={() => void createExport()}
                                className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-border/65 bg-background/55 px-3 py-2.5 text-xs font-semibold text-foreground transition-colors hover:bg-background"
                            >
                                <RefreshCw className="size-4" />
                                Refresh QR
                            </button>
                            <p className="text-xs leading-relaxed text-muted-foreground">
                                Anyone with this QR can view the decrypted export until it expires.
                            </p>
                        </div>
                    )}

                    {exportState.status === "expired" && (
                        <div className="flex min-h-[18rem] flex-col items-center justify-center rounded-2xl border border-border/50 bg-background/45 px-6 text-center">
                            <QrCode className="size-7 text-muted-foreground" />
                            <p className="mt-3 text-sm font-semibold text-foreground">Export expired</p>
                            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                                Create a new QR when you are ready to scan or share it.
                            </p>
                            <button
                                type="button"
                                onClick={() => void createExport()}
                                className="mt-5 inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90"
                            >
                                <RefreshCw className="size-4" />
                                Create new QR
                            </button>
                        </div>
                    )}

                    {exportState.status === "error" && (
                        <div className="flex min-h-[18rem] flex-col items-center justify-center rounded-2xl border border-destructive/25 bg-destructive/10 px-6 text-center">
                            <p className="text-sm font-semibold text-destructive">Export failed</p>
                            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{exportState.message}</p>
                            <button
                                type="button"
                                onClick={() => void createExport()}
                                className="mt-5 inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90"
                            >
                                <RefreshCw className="size-4" />
                                Try again
                            </button>
                        </div>
                    )}
                </div>
            </div>
        </div>,
        document.body
    ) : null;

    return (
        <>
            <button
                type="button"
                onClick={openModal}
                disabled={isUnavailable}
                className={cn(
                    variant === "icon"
                        ? "inline-flex size-10 items-center justify-center rounded-full border border-border/70 bg-background/45 text-foreground/82 shadow-[0_1px_0_rgba(255,255,255,0.02)] transition-all hover:border-border hover:bg-card/75 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 disabled:cursor-not-allowed disabled:opacity-50"
                        : "inline-flex items-center gap-1.5 rounded-full border border-border/70 bg-background/45 px-3.5 py-2 text-xs font-medium text-foreground/82 shadow-[0_1px_0_rgba(255,255,255,0.02)] transition-all hover:border-border hover:bg-card/75 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 disabled:cursor-not-allowed disabled:opacity-50",
                    className
                )}
                aria-label="Export chat with QR code"
                title="Export chat"
            >
                <QrCode className="size-4" />
                {variant === "pill" && <span>Export</span>}
            </button>
            {modal}
        </>
    );
}
