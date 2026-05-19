import Link from "next/link";
import { ArrowUpRight, EyeOff, Inbox, SquareArrowOutUpRight } from "lucide-react";
import { updateContentRequest } from "@/app/admin/requests/actions";
import { fetchAdminContentRequests } from "@/lib/server/content-requests";
import { getPublishedRequestHref } from "@/lib/content-requests";
import type { ContentRequestStatus } from "@/types/content-requests";

const STATUS_OPTIONS: Array<{ value: ContentRequestStatus; label: string }> = [
    { value: "requested", label: "Requested" },
    { value: "under_review", label: "Under Review" },
    { value: "in_progress", label: "In Progress" },
    { value: "published", label: "Published" },
    { value: "source_unavailable", label: "Source Unavailable" },
    { value: "archived", label: "Archived" },
];

function formatContentType(type: string) {
    if (type === "book") return "Book";
    if (type === "podcast") return "Podcast";
    if (type === "video") return "Video";
    return "Article";
}

export default async function AdminRequestsPage() {
    const requests = await fetchAdminContentRequests();
    const visibleRequests = requests.filter((request) => !request.hidden_at && request.status !== "archived");
    const publishedRequests = requests.filter((request) => request.status === "published").length;

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

            <div className="grid gap-4 md:grid-cols-3">
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
            </div>

            <section className="rounded-xl border border-border bg-card text-card-foreground shadow-sm">
                <div className="border-b border-border px-6 py-4">
                    <h2 className="font-semibold text-foreground">Community Requests</h2>
                    <p className="text-sm text-muted-foreground">
                        Highest-impact requests should move from review to production once source availability is clear.
                    </p>
                </div>

                {requests.length > 0 ? (
                    <div className="divide-y divide-border">
                        {requests.map((request) => {
                            const publishedHref = getPublishedRequestHref(request);
                            const isHidden = Boolean(request.hidden_at) || request.status === "archived";

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
                                            <h3 className="truncate text-lg font-semibold text-foreground">{request.title}</h3>
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

                                    <form action={updateContentRequest} className="grid gap-3 rounded-lg border border-border bg-background p-4">
                                        <input type="hidden" name="requestId" value={request.id} />

                                        <label className="grid gap-1.5 text-sm font-medium text-foreground">
                                            Status
                                            <select
                                                name="status"
                                                defaultValue={request.status}
                                                className="h-10 rounded-md border border-input bg-white px-3 text-sm font-normal text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                                            >
                                                {STATUS_OPTIONS.map((status) => (
                                                    <option key={status.value} value={status.value}>
                                                        {status.label}
                                                    </option>
                                                ))}
                                            </select>
                                        </label>

                                        <label className="grid gap-1.5 text-sm font-medium text-foreground">
                                            Published content ID
                                            <input
                                                name="publishedContentId"
                                                defaultValue={request.published_content?.id ?? ""}
                                                placeholder="UUID from content item"
                                                className="h-10 rounded-md border border-input bg-white px-3 text-sm font-normal text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                                            />
                                        </label>

                                        <label className="grid gap-1.5 text-sm font-medium text-foreground">
                                            Visibility
                                            <select
                                                name="hideRequest"
                                                defaultValue={isHidden ? "true" : "false"}
                                                className="h-10 rounded-md border border-input bg-white px-3 text-sm font-normal text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                                            >
                                                <option value="false">Visible</option>
                                                <option value="true">Hidden</option>
                                            </select>
                                        </label>

                                        <label className="grid gap-1.5 text-sm font-medium text-foreground">
                                            Hidden reason
                                            <input
                                                name="hiddenReason"
                                                defaultValue={request.hidden_reason ?? ""}
                                                placeholder="Spam, duplicate cleanup, source issue..."
                                                className="h-10 rounded-md border border-input bg-white px-3 text-sm font-normal text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                                            />
                                        </label>

                                        <button
                                            type="submit"
                                            className="focus-ring inline-flex h-10 items-center justify-center rounded-lg bg-zinc-900 px-4 text-sm font-medium text-white transition-colors hover:bg-zinc-800"
                                        >
                                            Save changes
                                        </button>
                                    </form>
                                </article>
                            );
                        })}
                    </div>
                ) : (
                    <div className="flex flex-col items-center justify-center px-6 py-16 text-center">
                        <Inbox className="size-10 text-muted-foreground" />
                        <h3 className="mt-4 font-semibold text-foreground">No requests yet</h3>
                        <p className="mt-1 max-w-md text-sm text-muted-foreground">
                            Once users submit ideas from the public board, they will appear here for review.
                        </p>
                    </div>
                )}
            </section>
        </div>
    );
}
