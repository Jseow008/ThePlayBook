"use client";

import { useEffect, useState } from "react";
import { RefreshCw, TerminalSquare } from "lucide-react";

type CoverageSummary = {
    total_library_content_items: number;
    embedded_content_items: number;
    missing_segments: number;
    estimated_remaining_characters: number;
};

type CoverageResponse = {
    summary: CoverageSummary | null;
    command?: string;
    dry_run_command?: string;
};

function formatNumber(value: number) {
    return new Intl.NumberFormat().format(value);
}

export function SyncSegmentEmbeddingsButton() {
    const [summary, setSummary] = useState<CoverageSummary | null>(null);
    const [command, setCommand] = useState("npm run embeddings:sync-segments");
    const [dryRunCommand, setDryRunCommand] = useState("npm run embeddings:sync-segments -- --dry-run");
    const [status, setStatus] = useState<{ tone: "error" | "info"; text: string } | null>(null);
    const [isLoadingSummary, setIsLoadingSummary] = useState(true);
    const [isRefreshing, setIsRefreshing] = useState(false);

    const loadSummary = async (isManualRefresh = false) => {
        try {
            if (isManualRefresh) {
                setIsRefreshing(true);
            } else {
                setIsLoadingSummary(true);
            }

            const res = await fetch("/api/admin/embeddings/sync-segments", {
                method: "GET",
            });
            const data = await res.json() as CoverageResponse;

            if (!res.ok) {
                const errorMessage = (data as any)?.error?.message || "Failed to load embedding coverage";
                throw new Error(typeof errorMessage === "string" ? errorMessage : "Failed to load embedding coverage");
            }

            setSummary(data.summary ?? null);
            if (data.command) {
                setCommand(data.command);
            }
            if (data.dry_run_command) {
                setDryRunCommand(data.dry_run_command);
            }

            if (isManualRefresh) {
                setStatus({ tone: "info", text: "Coverage refreshed." });
                setTimeout(() => {
                    setStatus(null);
                }, 3000);
            } else {
                setStatus(null);
            }
        } catch (error: any) {
            setStatus({ tone: "error", text: "Error: " + error.message });
        } finally {
            setIsLoadingSummary(false);
            setIsRefreshing(false);
        }
    };

    useEffect(() => {
        void loadSummary();
    }, []);

    return (
        <div className="min-w-[20rem] max-w-sm rounded-xl border border-border bg-card px-4 py-3 text-left shadow-sm">
            <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                    <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
                        <TerminalSquare className="size-4 text-primary" />
                        <span>Sync AI Segments</span>
                    </div>
                    <p className="mt-1 text-xs leading-5 text-zinc-500">
                        Segment syncing now runs locally. Use the command below from a trusted machine, then refresh coverage here.
                    </p>
                </div>
                <button
                    type="button"
                    onClick={() => void loadSummary(true)}
                    disabled={isRefreshing || isLoadingSummary}
                    className="focus-ring inline-flex shrink-0 items-center justify-center gap-2 rounded-lg border border-border bg-background px-3 py-2 text-xs font-medium text-foreground transition-colors hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50"
                >
                    <RefreshCw className={`size-3.5 ${isRefreshing || isLoadingSummary ? "animate-spin" : ""}`} />
                    Refresh
                </button>
            </div>

            <div className="mt-3 space-y-2 text-[11px] leading-5 text-zinc-500">
                {isLoadingSummary ? (
                    <span>Loading embedding coverage...</span>
                ) : summary ? (
                    <>
                        <div>{summary.total_library_content_items} library items referenced</div>
                        <div>{summary.embedded_content_items} content items have Gemini segment embeddings</div>
                        <div>{summary.missing_segments} verified segments still need Gemini embeddings</div>
                        <div>{formatNumber(summary.estimated_remaining_characters)} characters remaining to embed</div>
                    </>
                ) : (
                    <span>No embedding coverage is available yet.</span>
                )}
            </div>

            <div className="mt-3 space-y-2">
                <div>
                    <div className="text-[11px] font-medium uppercase tracking-[0.14em] text-zinc-500">Run locally</div>
                    <code className="mt-1 block overflow-x-auto rounded-lg bg-zinc-950 px-3 py-2 text-xs text-zinc-100">
                        {command}
                    </code>
                </div>
                <div>
                    <div className="text-[11px] font-medium uppercase tracking-[0.14em] text-zinc-500">Dry run</div>
                    <code className="mt-1 block overflow-x-auto rounded-lg bg-zinc-950 px-3 py-2 text-xs text-zinc-100">
                        {dryRunCommand}
                    </code>
                </div>
            </div>

            {status && (
                <div className={`mt-3 text-xs font-medium ${status.tone === "error" ? "text-red-500" : "text-emerald-500"}`}>
                    {status.text}
                </div>
            )}
        </div>
    );
}
