import Link from "next/link";
import { ArrowUpRight, EyeOff, Inbox, SquareArrowOutUpRight } from "lucide-react";
import { AdminContentRequestForm } from "@/components/admin/AdminContentRequestForm";
import { getContentRequestNotificationBacklogStats } from "@/lib/server/content-request-notifications";
import { fetchAdminContentRequests, fetchPublishedContentOptions } from "@/lib/server/content-requests";
import { getPublishedRequestHref } from "@/lib/content-requests";

type AdminRequestView = "all" | "top" | "pending" | "processing" | "skipped" | "failed";

const QUICK_FILTERS: Array<{ value: AdminRequestView; label: string; description: string }> = [
    { value: "all", label: "All", description: "Full queue" },
    { value: "top", label: "Top voted", description: "Highest demand" },
    { value: "pending", label: "Pending", description: "New submissions" },
    { value: "processing", label: "Processing", description: "Claimed by script or admin" },
    { value: "skipped", label: "Skipped", description: "Intentionally not processed" },
    { value: "failed", label: "Failed", description: "Processing failed" },
];

function formatContentType(type: string) {
    if (type === "book") return "Book";
    if (type === "podcast") return "Podcast";
    if (type === "video") return "Video";
    return "Article";
}

function normalizeView(value?: string): AdminRequestView {
    return QUICK_FILTERS.some((filter) => filter.value === value) ? value as AdminRequestView : "all";
}

function filterRequests(requests: Awaited<ReturnType<typeof fetchAdminContentRequests>>, view: AdminRequestView) {
    const actionableRequests = requests.filter((request) => !request.hidden_at && (request.status === "pending" || request.status === "processing"));

    if (view === "top") {
        return [...actionableRequests].sort((a, b) => b.vote_count - a.vote_count || new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    }

    if (view === "pending" || view === "processing" || view === "skipped" || view === "failed") {
        return requests.filter((request) => request.status === view);
    }

    return requests;
}

function isPublicVisibleRequest(request: Awaited<ReturnType<typeof fetchAdminContentRequests>>[number]) {
    return !request.hidden_at && request.status !== "skipped" && request.status !== "failed";
}

function buildQuickFilterHref(view: AdminRequestView) {
    return view === "all" ? "/admin/requests" : `/admin/requests?view=${view}`;
}

function getNotificationHealth(stats: Awaited<ReturnType<typeof getContentRequestNotificationBacklogStats>>) {
    if (stats.failed > 0 || stats.queuedOlderThanOneHour > 0 || stats.staleProcessing > 0) {
        return {
            label: "Needs attention",
            valueClassName: "text-amber-700",
            description: "Review failed or aging notifications.",
        };
    }

    if (stats.queued > 0 || stats.processing > 0) {
        return {
            label: "Draining",
            valueClassName: "text-sky-700",
            description: "Queued notifications are being processed.",
        };
    }

    return {
        label: "Healthy",
        valueClassName: "text-emerald-600",
        description: "No delayed notification work.",
    };
}

export default async function AdminRequestsPage({
    searchParams,
}: {
    searchParams?: Promise<{ view?: string }>;
}) {
    const resolvedSearchParams = await searchParams;
    const activeView = normalizeView(resolvedSearchParams?.view);
    const [requests, publishedContentOptions, notificationStats] = await Promise.all([
        fetchAdminContentRequests(),
        fetchPublishedContentOptions(),
        getContentRequestNotificationBacklogStats(),
    ]);
    const notificationHealth = getNotificationHealth(notificationStats);
    const visibleRequests = requests.filter(isPublicVisibleRequest);
    const publishedRequests = requests.filter((request) => request.status === "published").length;
    const visibleTopRequests = visibleRequests.filter((request) => request.status === "pending" || request.status === "processing");
    const pendingRequests = requests.filter((request) => request.status === "pending");
    const processingRequests = requests.filter((request) => request.status === "processing");
    const skippedRequests = requests.filter((request) => request.status === "skipped");
    const failedRequests = requests.filter((request) => request.status === "failed");
    const displayRequests = filterRequests(requests, activeView);
    const filterCounts: Record<AdminRequestView, number> = {
        all: requests.length,
        top: visibleTopRequests.length,
        pending: pendingRequests.length,
        processing: processingRequests.length,
        skipped: skippedRequests.length,
        failed: failedRequests.length,
    };

    return (
        <div className="space-y-8">
            <div className="flex flex-col gap-6 xl:flex-row xl:items-start xl:justify-between">
                <div>
                    <h1 className="text-2xl font-bold text-foreground">Request Board</h1>
                    <p className="mt-1 text-muted-foreground">
                        Review community demand, update production status, and connect published summaries.
                    </p>
                </div>
                <Link
                    href="/requests"
                    target="_blank"
                    className="focus-ring inline-flex items-center justify-center gap-2 rounded-lg border border-border bg-card px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-muted"
                >
                    View public board
                    <SquareArrowOutUpRight className="size-4" />
                </Link>
            </div>

            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                <div className="rounded-xl border border-border bg-card p-5 shadow-sm">
                    <p className="text-sm font-medium text-muted-foreground">Visible Requests</p>
                    <p className="mt-1 text-3xl font-bold text-foreground">{visibleRequests.length}</p>
                </div>
                <div className="rounded-xl border border-border bg-card p-5 shadow-sm">
                    <p className="text-sm font-medium text-muted-foreground">Total Votes</p>
                    <p className="mt-1 text-3xl font-bold text-foreground">
                        {requests.reduce((sum, request) => sum + request.vote_count, 0)}
                    </p>
                </div>
                <div className="rounded-xl border border-border bg-card p-5 shadow-sm">
                    <p className="text-sm font-medium text-muted-foreground">Published</p>
                    <p className="mt-1 text-3xl font-bold text-emerald-600">{publishedRequests}</p>
                </div>
                <div className="rounded-xl border border-border bg-card p-5 shadow-sm">
                    <p className="text-sm font-medium text-muted-foreground">Notification Queue</p>
                    <p className={`mt-1 text-3xl font-bold ${notificationHealth.valueClassName}`}>
                        {notificationHealth.label}
                    </p>
                    <p className="mt-1 text-sm text-muted-foreground">{notificationHealth.description}</p>
                </div>
            </div>

            <section className="rounded-xl border border-border bg-card p-5 shadow-sm">
                <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
                    <div>
                        <h2 className="font-semibold text-foreground">Request Notification Health</h2>
                        <p className="text-sm text-muted-foreground">
                            Watch for delivery backlog before users miss published-summary emails.
                        </p>
                    </div>
                    <p className="text-sm text-muted-foreground">
                        Sent last 24h: <span className="font-semibold text-foreground">{notificationStats.sentLast24Hours}</span>
                    </p>
                </div>
                <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
                    <div className="rounded-lg border border-border bg-background px-4 py-3">
                        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Queued</p>
                        <p className="mt-1 text-2xl font-semibold text-foreground">{notificationStats.queued}</p>
                    </div>
                    <div className="rounded-lg border border-border bg-background px-4 py-3">
                        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Queued &gt; 1h</p>
                        <p className={`mt-1 text-2xl font-semibold ${notificationStats.queuedOlderThanOneHour > 0 ? "text-amber-700" : "text-foreground"}`}>
                            {notificationStats.queuedOlderThanOneHour}
                        </p>
                    </div>
                    <div className="rounded-lg border border-border bg-background px-4 py-3">
                        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Processing</p>
                        <p className="mt-1 text-2xl font-semibold text-foreground">{notificationStats.processing}</p>
                    </div>
                    <div className="rounded-lg border border-border bg-background px-4 py-3">
                        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Stale</p>
                        <p className={`mt-1 text-2xl font-semibold ${notificationStats.staleProcessing > 0 ? "text-amber-700" : "text-foreground"}`}>
                            {notificationStats.staleProcessing}
                        </p>
                    </div>
                    <div className="rounded-lg border border-border bg-background px-4 py-3">
                        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Failed</p>
                        <p className={`mt-1 text-2xl font-semibold ${notificationStats.failed > 0 ? "text-red-700" : "text-foreground"}`}>
                            {notificationStats.failed}
                        </p>
                    </div>
                </div>
            </section>

            <nav className="flex flex-wrap gap-2" aria-label="Request board quick filters">
                {QUICK_FILTERS.map((filter) => {
                    const isActive = activeView === filter.value;

                    return (
                        <Link
                            key={filter.value}
                            href={buildQuickFilterHref(filter.value)}
                            className={`focus-ring inline-flex items-center gap-2 rounded-lg border px-4 py-2 text-sm font-medium transition-colors ${
                                isActive
                                    ? "border-zinc-900 bg-zinc-900 text-white"
                                    : "border-border bg-card text-foreground hover:bg-muted"
                            }`}
                        >
                            <span>{filter.label}</span>
                            <span className={`rounded-full px-2 py-0.5 text-xs ${isActive ? "bg-white/15 text-white" : "bg-zinc-100 text-zinc-700"}`}>
                                {filterCounts[filter.value]}
                            </span>
                        </Link>
                    );
                })}
            </nav>

            <section className="rounded-xl border border-border bg-card text-card-foreground shadow-sm">
                <div className="border-b border-border px-6 py-4">
                    <h2 className="font-semibold text-foreground">Community Requests</h2>
                    <p className="text-sm text-muted-foreground">
                        Highest-impact requests should move from pending to processing once source availability is clear.
                    </p>
                </div>

                {displayRequests.length > 0 ? (
                    <div className="divide-y divide-border">
                        {displayRequests.map((request) => {
                            const publishedHref = getPublishedRequestHref(request);
                            const isHidden = Boolean(request.hidden_at);

                            return (
                                <article key={request.id} className="grid gap-5 px-6 py-5 xl:grid-cols-[minmax(0,1fr)_28rem]">
                                    <div className="min-w-0 space-y-3">
                                        <div className="flex flex-wrap items-center gap-2">
                                            <span className="rounded-full bg-zinc-100 px-2.5 py-1 text-xs font-semibold text-zinc-700">
                                                {formatContentType(request.content_type)}
                                            </span>
                                            <span className="rounded-full bg-zinc-100 px-2.5 py-1 text-xs font-semibold text-zinc-700">
                                                {request.vote_count} {request.vote_count === 1 ? "vote" : "votes"}
                                            </span>
                                            {isHidden ? (
                                                <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2.5 py-1 text-xs font-semibold text-amber-800">
                                                    <EyeOff className="size-3.5" />
                                                    Hidden
                                                </span>
                                            ) : null}
                                        </div>

                                        <div>
                                            <h3 className="line-clamp-2 text-lg font-semibold text-foreground">{request.title}</h3>
                                            <p className="mt-1 text-sm text-muted-foreground">
                                                {request.author || "No creator listed"} • Added{" "}
                                                {new Date(request.created_at).toLocaleDateString()}
                                            </p>
                                        </div>

                                        <div className="flex flex-wrap gap-3 text-sm">
                                            {request.source_url ? (
                                                <a
                                                    href={request.source_url}
                                                    target="_blank"
                                                    rel="noreferrer"
                                                    className="focus-ring inline-flex items-center gap-1 rounded-lg border border-border px-3 py-2 font-medium text-foreground transition-colors hover:bg-muted"
                                                >
                                                    Source
                                                    <ArrowUpRight className="size-4" />
                                                </a>
                                            ) : null}
                                            {publishedHref ? (
                                                <Link
                                                    href={publishedHref}
                                                    target="_blank"
                                                    className="focus-ring inline-flex items-center gap-1 rounded-lg border border-border px-3 py-2 font-medium text-foreground transition-colors hover:bg-muted"
                                                >
                                                    Published summary
                                                    <ArrowUpRight className="size-4" />
                                                </Link>
                                            ) : null}
                                        </div>
                                    </div>

                                    <AdminContentRequestForm request={request} publishedContentOptions={publishedContentOptions} />
                                </article>
                            );
                        })}
                    </div>
                ) : (
                    <div className="flex flex-col items-center justify-center px-6 py-16 text-center">
                        <Inbox className="size-10 text-muted-foreground" />
                        <h3 className="mt-4 font-semibold text-foreground">
                            {requests.length > 0 ? "No requests match this filter" : "No requests yet"}
                        </h3>
                        <p className="mt-1 max-w-md text-sm text-muted-foreground">
                            {requests.length > 0
                                ? "Switch filters to continue reviewing the request board."
                                : "Once users submit ideas from the public board, they will appear here for review."}
                        </p>
                    </div>
                )}
            </section>
        </div>
    );
}
