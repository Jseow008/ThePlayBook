"use client";

import type { ReactNode } from "react";
import { useEffect, useState } from "react";
import {
    Bot,
    Database,
    Loader2,
    RefreshCw,
    ShieldCheck,
    TriangleAlert,
} from "lucide-react";

type RuntimeCheckState =
    | "ready"
    | "missing"
    | "invalid"
    | "derived"
    | "not_configured";

type LaunchReadinessStatus = "ready" | "degraded";

type LaunchReadinessResponse = {
    status: LaunchReadinessStatus;
    timestamp: string;
    runtime: {
        environment: string;
        status: LaunchReadinessStatus;
        checks: {
            supabase_public: RuntimeCheckState;
            supabase_admin: RuntimeCheckState;
            site_url: RuntimeCheckState;
            app_url: RuntimeCheckState;
            ai_generation: RuntimeCheckState;
            ai_retrieval: RuntimeCheckState;
            rate_limiting: RuntimeCheckState;
            error_reporting: RuntimeCheckState;
        };
        issues: string[];
    };
    database: {
        status: LaunchReadinessStatus;
        ai_readiness: {
            status: LaunchReadinessStatus;
            summary: {
                verified_items: number;
                ai_ready_items: number;
                ai_stale_items: number;
                stale_content_embeddings: number;
                stale_segment_embeddings: number;
                items_without_published_segments: number;
            } | null;
            issues: string[];
        };
        segment_coverage: {
            status: LaunchReadinessStatus;
            summary: {
                total_library_content_items: number;
                embedded_content_items: number;
                missing_segments: number;
                estimated_remaining_characters: number;
            } | null;
            issues: string[];
        };
        storage: {
            status: LaunchReadinessStatus;
            buckets: {
                media: {
                    present: boolean;
                    public: boolean | null;
                    status: LaunchReadinessStatus;
                };
                audio: {
                    present: boolean;
                    public: boolean | null;
                    status: LaunchReadinessStatus;
                };
            };
            issues: string[];
        };
    };
    issues: string[];
};

const CHECK_LABELS: Record<keyof LaunchReadinessResponse["runtime"]["checks"], string> = {
    supabase_public: "Supabase public",
    supabase_admin: "Supabase admin",
    site_url: "Site URL",
    app_url: "App URL",
    ai_generation: "AI generation",
    ai_retrieval: "AI retrieval",
    rate_limiting: "Rate limiting",
    error_reporting: "Error reporting",
};

function isLaunchReadinessResponse(value: unknown): value is LaunchReadinessResponse {
    return Boolean(
        value
        && typeof value === "object"
        && "status" in value
        && (((value as { status?: unknown }).status === "ready")
            || ((value as { status?: unknown }).status === "degraded"))
        && "runtime" in value
        && "database" in value
    );
}

function formatStateLabel(value: string) {
    return value.replace(/_/g, " ");
}

function formatNumber(value: number) {
    return new Intl.NumberFormat("en-US").format(value);
}

function toneClasses(state: RuntimeCheckState | LaunchReadinessStatus) {
    switch (state) {
        case "ready":
            return "border-emerald-500/20 bg-emerald-500/10 text-emerald-300";
        case "derived":
            return "border-sky-500/20 bg-sky-500/10 text-sky-300";
        case "not_configured":
            return "border-zinc-500/20 bg-zinc-500/10 text-zinc-300";
        case "missing":
        case "invalid":
        case "degraded":
        default:
            return "border-amber-500/20 bg-amber-500/10 text-amber-300";
    }
}

function StatusPill({
    children,
    state,
}: {
    children: ReactNode;
    state: RuntimeCheckState | LaunchReadinessStatus;
}) {
    return (
        <span
            className={`inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] ${toneClasses(state)}`}
        >
            {children}
        </span>
    );
}

function SummaryMetric({
    label,
    testId,
    tone = "text-foreground",
    value,
}: {
    label: string;
    testId?: string;
    tone?: string;
    value: string;
}) {
    return (
        <div
            className="rounded-lg border border-border bg-background/40 px-3 py-3"
            data-testid={testId}
        >
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                {label}
            </p>
            <p className={`mt-1 text-lg font-semibold ${tone}`}>{value}</p>
        </div>
    );
}

async function fetchLaunchReadiness(path: string): Promise<LaunchReadinessResponse> {
    const response = await fetch(path, {
        method: "GET",
        credentials: "same-origin",
        cache: "no-store",
    });
    const payload = await response.json().catch(() => null);

    if (isLaunchReadinessResponse(payload)) {
        return payload;
    }

    const message =
        (payload as { error?: { message?: string } } | null)?.error?.message
        || "Failed to load launch readiness";

    throw new Error(message);
}

export function LaunchReadinessPanel({
    endpoint = "/api/admin/launch-readiness",
}: {
    endpoint?: string;
}) {
    const [report, setReport] = useState<LaunchReadinessResponse | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [isRefreshing, setIsRefreshing] = useState(false);
    const [message, setMessage] = useState<string | null>(null);

    useEffect(() => {
        let active = true;

        async function loadReport(manualRefresh = false) {
            try {
                if (manualRefresh) {
                    setIsRefreshing(true);
                } else {
                    setIsLoading(true);
                }

                const nextReport = await fetchLaunchReadiness(endpoint);

                if (!active) {
                    return;
                }

                setReport(nextReport);
                setMessage(manualRefresh ? "Launch readiness refreshed." : null);
            } catch (error) {
                if (!active) {
                    return;
                }

                const nextMessage = error instanceof Error
                    ? error.message
                    : "Failed to load launch readiness";
                setMessage(`Error: ${nextMessage}`);
            } finally {
                if (!active) {
                    return;
                }

                setIsLoading(false);
                setIsRefreshing(false);
            }
        }

        void loadReport();

        return () => {
            active = false;
        };
    }, [endpoint]);

    const aiSummary = report?.database.ai_readiness.summary;
    const segmentSummary = report?.database.segment_coverage.summary;
    const visibleIssues = report?.issues.slice(0, 4) ?? [];
    const hiddenIssueCount = report ? Math.max(report.issues.length - visibleIssues.length, 0) : 0;

    return (
        <section className="rounded-xl border border-border bg-card text-card-foreground shadow-sm">
            <div className="flex flex-col gap-4 border-b border-border px-6 py-5 lg:flex-row lg:items-start lg:justify-between">
                <div className="space-y-2">
                    <div className="flex items-center gap-3">
                        <div className="inline-flex h-10 w-10 items-center justify-center rounded-lg border border-border bg-background/50 text-muted-foreground">
                            {report?.status === "ready" ? (
                                <ShieldCheck className="h-5 w-5 text-emerald-300" />
                            ) : (
                                <TriangleAlert className="h-5 w-5 text-amber-300" />
                            )}
                        </div>
                        <div>
                            <h2 className="text-base font-semibold text-foreground">Launch Readiness</h2>
                            <p className="text-sm text-muted-foreground">
                                Operator summary for runtime wiring, AI coverage, and storage buckets.
                            </p>
                        </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                        <StatusPill state={report?.status ?? "degraded"}>
                            {isLoading ? "Loading" : report?.status === "ready" ? "Ready" : "Needs attention"}
                        </StatusPill>
                        {report ? (
                            <>
                                <StatusPill state={report.runtime.status}>
                                    Runtime {formatStateLabel(report.runtime.status)}
                                </StatusPill>
                                <StatusPill state={report.database.status}>
                                    Data plane {formatStateLabel(report.database.status)}
                                </StatusPill>
                                <span className="text-xs text-muted-foreground">
                                    Env: {report.runtime.environment}
                                </span>
                            </>
                        ) : null}
                    </div>
                </div>

                <button
                    type="button"
                    onClick={async () => {
                        try {
                            setIsRefreshing(true);
                            const nextReport = await fetchLaunchReadiness(endpoint);
                            setReport(nextReport);
                            setMessage("Launch readiness refreshed.");
                        } catch (error) {
                            const nextMessage = error instanceof Error
                                ? error.message
                                : "Failed to load launch readiness";
                            setMessage(`Error: ${nextMessage}`);
                        } finally {
                            setIsRefreshing(false);
                        }
                    }}
                    disabled={isLoading || isRefreshing}
                    className="focus-ring inline-flex items-center justify-center gap-2 rounded-lg border border-border px-3 py-2 text-sm font-medium text-foreground transition-colors hover:bg-muted/60 disabled:cursor-not-allowed disabled:opacity-50"
                >
                    {isRefreshing ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                        <RefreshCw className="h-4 w-4" />
                    )}
                    Refresh
                </button>
            </div>

            {isLoading ? (
                <div className="flex items-center gap-3 px-6 py-6 text-sm text-muted-foreground">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Loading launch readiness...
                </div>
            ) : (
                <div className="space-y-5 px-6 py-5">
                    <div className="grid gap-4 xl:grid-cols-[1.3fr_1fr_1fr]">
                        <div className="rounded-xl border border-border bg-background/30 p-4">
                            <div className="mb-3 flex items-center gap-2">
                                <ShieldCheck className="h-4 w-4 text-muted-foreground" />
                                <h3 className="text-sm font-semibold text-foreground">Dependencies</h3>
                            </div>
                            <div className="grid gap-2 sm:grid-cols-2">
                                {report ? (
                                    Object.entries(report.runtime.checks).map(([key, value]) => (
                                        <div
                                            key={key}
                                            className="flex items-center justify-between gap-3 rounded-lg border border-border bg-card/70 px-3 py-2"
                                        >
                                            <span className="text-sm text-muted-foreground">
                                                {CHECK_LABELS[key as keyof LaunchReadinessResponse["runtime"]["checks"]]}
                                            </span>
                                            <StatusPill state={value}>{formatStateLabel(value)}</StatusPill>
                                        </div>
                                    ))
                                ) : (
                                    <p className="text-sm text-amber-300">Readiness data unavailable.</p>
                                )}
                            </div>
                        </div>

                        <div className="rounded-xl border border-border bg-background/30 p-4">
                            <div className="mb-3 flex items-center gap-2">
                                <Bot className="h-4 w-4 text-muted-foreground" />
                                <h3 className="text-sm font-semibold text-foreground">AI</h3>
                            </div>
                            <div className="grid gap-3">
                                <SummaryMetric
                                    label="AI-ready verified items"
                                    testId="launch-readiness-ai-ready"
                                    value={aiSummary
                                        ? `${formatNumber(aiSummary.ai_ready_items)} / ${formatNumber(aiSummary.verified_items)}`
                                        : "unavailable"}
                                    tone={report?.database.ai_readiness.status === "ready" ? "text-emerald-300" : "text-amber-300"}
                                />
                                <SummaryMetric
                                    label="Missing content embeddings"
                                    testId="launch-readiness-missing-content"
                                    value={aiSummary
                                        ? formatNumber(aiSummary.stale_content_embeddings)
                                        : "unavailable"}
                                    tone={aiSummary?.stale_content_embeddings === 0 ? "text-emerald-300" : "text-amber-300"}
                                />
                                <SummaryMetric
                                    label="Missing retrieval segments"
                                    testId="launch-readiness-missing-segments"
                                    value={segmentSummary
                                        ? formatNumber(segmentSummary.missing_segments)
                                        : "unavailable"}
                                    tone={segmentSummary?.missing_segments === 0 ? "text-emerald-300" : "text-amber-300"}
                                />
                            </div>
                        </div>

                        <div className="rounded-xl border border-border bg-background/30 p-4">
                            <div className="mb-3 flex items-center gap-2">
                                <Database className="h-4 w-4 text-muted-foreground" />
                                <h3 className="text-sm font-semibold text-foreground">Storage</h3>
                            </div>
                            <div className="grid gap-3">
                                <SummaryMetric
                                    label="Media bucket"
                                    testId="launch-readiness-media-bucket"
                                    value={report
                                        ? report.database.storage.buckets.media.status === "ready"
                                            ? "ready"
                                            : "degraded"
                                        : "unavailable"}
                                    tone={report?.database.storage.buckets.media.status === "ready" ? "text-emerald-300" : "text-amber-300"}
                                />
                                <SummaryMetric
                                    label="Audio bucket"
                                    testId="launch-readiness-audio-bucket"
                                    value={report
                                        ? report.database.storage.buckets.audio.status === "ready"
                                            ? "ready"
                                            : "degraded"
                                        : "unavailable"}
                                    tone={report?.database.storage.buckets.audio.status === "ready" ? "text-emerald-300" : "text-amber-300"}
                                />
                                <SummaryMetric
                                    label="Segment coverage"
                                    testId="launch-readiness-segment-coverage"
                                    value={segmentSummary
                                        ? `${formatNumber(segmentSummary.embedded_content_items)} / ${formatNumber(segmentSummary.total_library_content_items)}`
                                        : "unavailable"}
                                />
                            </div>
                        </div>
                    </div>

                    {report && report.issues.length > 0 ? (
                        <div className="rounded-xl border border-amber-500/20 bg-amber-500/8 p-4">
                            <div className="mb-2 flex items-center gap-2 text-amber-200">
                                <TriangleAlert className="h-4 w-4" />
                                <h3 className="text-sm font-semibold">Operator attention</h3>
                            </div>
                            <ul className="space-y-2 text-sm text-amber-100/90">
                                {visibleIssues.map((issue) => (
                                    <li key={issue}>{issue}</li>
                                ))}
                                {hiddenIssueCount > 0 ? (
                                    <li>{hiddenIssueCount} more launch issue{hiddenIssueCount === 1 ? "" : "s"} not shown here.</li>
                                ) : null}
                            </ul>
                        </div>
                    ) : (
                        report ? (
                            <p className="text-sm text-muted-foreground">
                                No launch-blocking issues were reported by the admin readiness endpoint.
                            </p>
                        ) : null
                    )}

                    {message ? (
                        <p className={`text-xs font-medium ${message.startsWith("Error:") ? "text-red-500" : "text-emerald-300"}`}>
                            {message}
                        </p>
                    ) : null}
                </div>
            )}
        </section>
    );
}
