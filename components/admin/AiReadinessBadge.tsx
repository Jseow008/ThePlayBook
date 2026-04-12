"use client";

type AiReadiness = {
    status: "not_applicable" | "stale" | "ready";
    stale_reasons: string[];
};

const LABELS: Record<AiReadiness["status"], string> = {
    not_applicable: "AI N/A",
    stale: "AI Needs Sync",
    ready: "AI Ready",
};

const STYLES: Record<AiReadiness["status"], string> = {
    not_applicable: "border-zinc-200 bg-zinc-100 text-zinc-600",
    stale: "border-amber-200 bg-amber-50 text-amber-700",
    ready: "border-emerald-200 bg-emerald-50 text-emerald-700",
};

export function AiReadinessBadge({ readiness }: { readiness?: AiReadiness | null }) {
    if (!readiness) {
        return null;
    }

    const title =
        readiness.status === "stale" && readiness.stale_reasons.length > 0
            ? `AI readiness: ${readiness.stale_reasons.join(", ")}`
            : "AI readiness";

    return (
        <span
            title={title}
            className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium ${STYLES[readiness.status]}`}
        >
            {LABELS[readiness.status]}
        </span>
    );
}
