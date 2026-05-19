"use client";

import { useMemo, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { ArrowUpRight, BookOpen, FileText, Headphones, Loader2, Play, Plus, Search, ThumbsUp, type LucideIcon } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { SignInLink } from "@/components/ui/SignInLink";
import { useAuthUser } from "@/hooks/useAuthUser";
import { cn } from "@/lib/utils";
import { getPublishedRequestHref } from "@/lib/content-requests";
import type { ContentType } from "@/types/database";
import type { ContentRequestBoardItem, ContentRequestMutationResult, ContentRequestStatus } from "@/types/content-requests";

const TYPE_OPTIONS: Array<{ value: ContentType; label: string; Icon: LucideIcon }> = [
    { value: "book", label: "Book", Icon: BookOpen },
    { value: "video", label: "Video", Icon: Play },
    { value: "podcast", label: "Podcast", Icon: Headphones },
    { value: "article", label: "Article", Icon: FileText },
];

const STATUS_COPY: Record<ContentRequestStatus, { label: string; className: string }> = {
    requested: {
        label: "Requested",
        className: "border-sky-400/25 bg-sky-400/10 text-sky-200",
    },
    under_review: {
        label: "Under Review",
        className: "border-violet-400/25 bg-violet-400/10 text-violet-200",
    },
    in_progress: {
        label: "In Progress",
        className: "border-amber-400/30 bg-amber-400/10 text-amber-200",
    },
    published: {
        label: "Published",
        className: "border-emerald-400/30 bg-emerald-400/10 text-emerald-200",
    },
    source_unavailable: {
        label: "Source Unavailable",
        className: "border-zinc-400/25 bg-zinc-400/10 text-zinc-200",
    },
    archived: {
        label: "Archived",
        className: "border-zinc-400/25 bg-zinc-400/10 text-zinc-300",
    },
};

function contentTypeLabel(type: ContentType) {
    return TYPE_OPTIONS.find((option) => option.value === type)?.label ?? "Request";
}

function contentTypeIcon(type: ContentType) {
    return TYPE_OPTIONS.find((option) => option.value === type)?.Icon ?? FileText;
}

function parseApiError(response: Response) {
    return response.json()
        .then((payload: { error?: { message?: string } }) => payload.error?.message || "Request failed.")
        .catch(() => "Request failed.");
}

function upsertRequest(items: ContentRequestBoardItem[], next: ContentRequestBoardItem) {
    const exists = items.some((item) => item.id === next.id);
    const updated = exists
        ? items.map((item) => item.id === next.id ? next : item)
        : [next, ...items];

    return updated.sort((a, b) => {
        if (b.vote_count !== a.vote_count) return b.vote_count - a.vote_count;
        return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    });
}

export function RequestBoard({
    initialRequests,
    initialVotedIds,
    initialInput = "",
    initialContentType = "book",
}: {
    initialRequests: ContentRequestBoardItem[];
    initialVotedIds: string[];
    initialInput?: string;
    initialContentType?: ContentType;
}) {
    const user = useAuthUser();
    const [requests, setRequests] = useState(initialRequests);
    const [votedIds, setVotedIds] = useState(() => new Set(initialVotedIds));
    const [input, setInput] = useState(initialInput);
    const [author, setAuthor] = useState("");
    const [contentType, setContentType] = useState<ContentType>(initialContentType);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [pendingVoteId, setPendingVoteId] = useState<string | null>(null);

    const topRequests = useMemo(() => requests.slice(0, 3), [requests]);

    const updateVotedIds = (requestId: string, voted: boolean) => {
        setVotedIds((current) => {
            const next = new Set(current);
            if (voted) {
                next.add(requestId);
            } else {
                next.delete(requestId);
            }
            return next;
        });
    };

    const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        if (isSubmitting) return;

        if (!user) {
            toast.error("Sign in to submit a request.");
            return;
        }

        setIsSubmitting(true);

        try {
            const response = await fetch("/api/content-requests", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    input,
                    author: author || null,
                    content_type: contentType,
                }),
            });

            if (!response.ok) {
                throw new Error(await parseApiError(response));
            }

            const payload = await response.json() as { data: ContentRequestMutationResult };
            setRequests((current) => upsertRequest(current, payload.data.request));
            updateVotedIds(payload.data.request.id, payload.data.voted);
            setInput("");
            setAuthor("");
            toast.success(payload.data.duplicate ? "That request already exists, so your vote was added." : "Request added to the board.");
        } catch (error) {
            toast.error(error instanceof Error ? error.message : "Could not submit this request.");
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleVote = async (request: ContentRequestBoardItem) => {
        if (pendingVoteId) return;

        if (!user) {
            toast.error("Sign in to vote on requests.");
            return;
        }

        const wasVoted = votedIds.has(request.id);
        setPendingVoteId(request.id);
        updateVotedIds(request.id, !wasVoted);
        setRequests((current) => current.map((item) => item.id === request.id
            ? { ...item, vote_count: Math.max(0, item.vote_count + (wasVoted ? -1 : 1)) }
            : item
        ));

        try {
            const response = await fetch(`/api/content-requests/${request.id}/vote`, {
                method: wasVoted ? "DELETE" : "POST",
            });

            if (!response.ok) {
                throw new Error(await parseApiError(response));
            }

            const payload = await response.json() as {
                data: { request: ContentRequestBoardItem; voted: boolean };
            };
            setRequests((current) => upsertRequest(current, payload.data.request));
            updateVotedIds(payload.data.request.id, payload.data.voted);
        } catch (error) {
            updateVotedIds(request.id, wasVoted);
            setRequests((current) => current.map((item) => item.id === request.id ? request : item));
            toast.error(error instanceof Error ? error.message : "Could not update your vote.");
        } finally {
            setPendingVoteId(null);
        }
    };

    return (
        <div className="min-h-screen bg-background text-foreground">
            <section className="mx-auto flex w-full max-w-7xl flex-col gap-8 px-4 pb-10 pt-8 sm:px-6 lg:px-8 lg:pt-14">
                <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_22rem] lg:items-end">
                    <div className="max-w-3xl">
                        <p className="text-sm font-semibold uppercase tracking-[0.18em] text-primary">Community Requests</p>
                        <h1 className="mt-4 text-4xl font-bold tracking-normal text-foreground sm:text-5xl">
                            Vote on what Netflux should summarize next.
                        </h1>
                        <p className="mt-4 max-w-2xl text-base leading-7 text-muted-foreground sm:text-lg">
                            Add a book, video, podcast, or article. We prioritize requests by community votes and source availability.
                        </p>
                    </div>

                    <div className="hidden rounded-xl border border-border bg-card/70 p-5 shadow-sm backdrop-blur lg:block">
                        <p className="text-sm font-medium text-muted-foreground">Leading requests</p>
                        <div className="mt-4 space-y-3">
                            {topRequests.length > 0 ? topRequests.map((request, index) => (
                                <div key={request.id} className="flex items-center justify-between gap-3">
                                    <div className="min-w-0">
                                        <p className="truncate text-sm font-semibold text-foreground">
                                            {index + 1}. {request.title}
                                        </p>
                                        <p className="text-xs text-muted-foreground">{contentTypeLabel(request.content_type)}</p>
                                    </div>
                                    <span className="rounded-full bg-primary/10 px-2.5 py-1 text-xs font-semibold text-primary">
                                        {request.vote_count}
                                    </span>
                                </div>
                            )) : (
                                <p className="text-sm text-muted-foreground">Be the first to add a request.</p>
                            )}
                        </div>
                    </div>
                </div>

                <form onSubmit={handleSubmit} className="rounded-xl border border-border bg-card/80 p-4 shadow-sm backdrop-blur sm:p-5">
                    <div className="mb-4 flex flex-wrap gap-2">
                        {TYPE_OPTIONS.map(({ value, label, Icon }) => {
                            const isActive = contentType === value;

                            return (
                                <button
                                    key={value}
                                    type="button"
                                    onClick={() => setContentType(value)}
                                    className={cn(
                                        "focus-ring inline-flex h-9 items-center gap-2 rounded-full border px-3 text-sm font-medium transition-colors",
                                        isActive
                                            ? "border-primary bg-primary/10 text-primary"
                                            : "border-border bg-background text-muted-foreground hover:text-foreground"
                                    )}
                                >
                                    <Icon className="size-4" />
                                    {label}
                                </button>
                            );
                        })}
                    </div>

                    <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_15rem_auto] xl:items-end">
                        <label className="grid gap-2 text-sm font-medium text-foreground">
                            Title or URL
                            <div className="relative">
                                <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                                <input
                                    value={input}
                                    onChange={(event) => setInput(event.target.value)}
                                    placeholder="Paste a URL or type a title by author"
                                    className="h-11 w-full rounded-lg border border-input bg-background pl-10 pr-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                                    required
                                />
                            </div>
                        </label>

                        <label className="grid gap-2 text-sm font-medium text-foreground">
                            Creator
                            <input
                                value={author}
                                onChange={(event) => setAuthor(event.target.value)}
                                placeholder="Optional"
                                className="h-11 rounded-lg border border-input bg-background px-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                            />
                        </label>

                        {user ? (
                            <Button type="submit" disabled={isSubmitting} className="h-11 gap-2 rounded-lg">
                                {isSubmitting ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />}
                                Submit
                            </Button>
                        ) : (
                            <SignInLink className="focus-ring inline-flex h-11 items-center justify-center gap-2 rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90">
                                Sign in to submit
                            </SignInLink>
                        )}
                    </div>
                </form>

                <section className="mt-24 grid gap-4 md:mt-0 md:grid-cols-2 xl:grid-cols-3">
                    {requests.length > 0 ? requests.map((request) => (
                        <RequestCard
                            key={request.id}
                            request={request}
                            isVoted={votedIds.has(request.id)}
                            isPending={pendingVoteId === request.id}
                            onVote={() => handleVote(request)}
                        />
                    )) : (
                        <div className="rounded-xl border border-dashed border-border bg-card/50 p-8 text-center md:col-span-2 xl:col-span-3">
                            <BookOpen className="mx-auto size-10 text-muted-foreground" />
                            <h2 className="mt-4 text-lg font-semibold text-foreground">No requests yet</h2>
                            <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">
                                Submit the first source and start shaping the next batch of Netflux summaries.
                            </p>
                        </div>
                    )}
                </section>
            </section>
        </div>
    );
}

function RequestCard({
    request,
    isVoted,
    isPending,
    onVote,
}: {
    request: ContentRequestBoardItem;
    isVoted: boolean;
    isPending: boolean;
    onVote: () => void;
}) {
    const Icon = contentTypeIcon(request.content_type);
    const status = STATUS_COPY[request.status];
    const publishedHref = getPublishedRequestHref(request);

    return (
        <article className="group flex min-h-[22rem] flex-col overflow-hidden rounded-xl border border-border bg-card text-card-foreground shadow-sm transition-colors hover:border-border/80">
            <div className="relative aspect-[16/9] overflow-hidden bg-muted/30">
                {request.thumbnail_url ? (
                    <Image
                        src={request.thumbnail_url}
                        alt=""
                        fill
                        sizes="(min-width: 1280px) 30vw, (min-width: 768px) 45vw, 100vw"
                        className="object-cover transition-transform duration-300 group-hover:scale-[1.02]"
                    />
                ) : (
                    <div className="flex h-full items-center justify-center bg-gradient-to-br from-card via-muted/20 to-background">
                        <Icon className="size-12 text-muted-foreground" />
                    </div>
                )}
                <div className="absolute left-3 top-3 flex flex-wrap gap-2">
                    <span className="rounded-full border border-white/10 bg-background/80 px-2.5 py-1 text-xs font-semibold text-foreground backdrop-blur">
                        {contentTypeLabel(request.content_type)}
                    </span>
                    <span className={cn("rounded-full border px-2.5 py-1 text-xs font-semibold backdrop-blur", status.className)}>
                        {status.label}
                    </span>
                </div>
            </div>

            <div className="flex flex-1 flex-col p-4">
                <div className="min-w-0">
                    <h2 className="line-clamp-2 text-lg font-semibold leading-snug text-foreground">{request.title}</h2>
                    <p className="mt-2 line-clamp-1 text-sm text-muted-foreground">
                        {request.author || "Creator not listed"}
                    </p>
                </div>

                <div className="mt-auto flex items-center justify-between gap-3 pt-5">
                    <button
                        type="button"
                        onClick={onVote}
                        disabled={isPending}
                        aria-pressed={isVoted}
                        className={cn(
                            "focus-ring inline-flex h-10 items-center gap-2 rounded-lg border px-3 text-sm font-semibold transition-colors disabled:opacity-70",
                            isVoted
                                ? "border-primary bg-primary text-primary-foreground hover:bg-primary/90"
                                : "border-border bg-background text-foreground hover:bg-muted"
                        )}
                    >
                        {isPending ? <Loader2 className="size-4 animate-spin" /> : <ThumbsUp className="size-4" />}
                        {request.vote_count}
                    </button>

                    <div className="flex items-center gap-2">
                        {request.source_url ? (
                            <a
                                href={request.source_url}
                                target="_blank"
                                rel="noreferrer"
                                className="focus-ring inline-flex h-10 items-center justify-center rounded-lg border border-border bg-background px-3 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                            >
                                Source
                            </a>
                        ) : null}
                        {publishedHref ? (
                            <Link
                                href={publishedHref}
                                className="focus-ring inline-flex h-10 items-center gap-1.5 rounded-lg bg-primary px-3 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90"
                            >
                                Read
                                <ArrowUpRight className="size-4" />
                            </Link>
                        ) : null}
                    </div>
                </div>
            </div>
        </article>
    );
}
