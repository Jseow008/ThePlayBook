"use client";

import { useMemo, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import {
    ArrowUpRight,
    BookOpen,
    CheckCircle2,
    FileText,
    Headphones,
    Loader2,
    Play,
    Plus,
    Search,
    SlidersHorizontal,
    ThumbsUp,
    type LucideIcon,
} from "lucide-react";
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

const BOARD_FILTER_OPTIONS: Array<{ value: "all" | ContentType; label: string; Icon?: LucideIcon }> = [
    { value: "all", label: "All formats" },
    ...TYPE_OPTIONS,
];

const SORT_OPTIONS = [
    { value: "most_voted", label: "Most voted" },
    { value: "recent", label: "Recently added" },
] as const;

type BoardTypeFilter = typeof BOARD_FILTER_OPTIONS[number]["value"];
type BoardSort = typeof SORT_OPTIONS[number]["value"];
type BoardView = "all" | "mine";

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

function sortRequests(items: ContentRequestBoardItem[], sort: BoardSort) {
    return [...items].sort((a, b) => {
        if (sort === "recent") {
            return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
        }

        if (b.vote_count !== a.vote_count) return b.vote_count - a.vote_count;
        return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    });
}

function matchesTypeFilter(request: ContentRequestBoardItem, filter: BoardTypeFilter) {
    return filter === "all" || request.content_type === filter;
}

function matchesUserRequest(request: ContentRequestBoardItem, submittedIds: Set<string>, votedIds: Set<string>) {
    return submittedIds.has(request.id) || votedIds.has(request.id);
}

export function RequestBoard({
    initialRequests,
    initialVotedIds,
    initialSubmittedIds,
    initialInput = "",
    initialContentType = "book",
}: {
    initialRequests: ContentRequestBoardItem[];
    initialVotedIds: string[];
    initialSubmittedIds: string[];
    initialInput?: string;
    initialContentType?: ContentType;
}) {
    const user = useAuthUser();
    const [requests, setRequests] = useState(initialRequests);
    const [votedIds, setVotedIds] = useState(() => new Set(initialVotedIds));
    const [submittedIds, setSubmittedIds] = useState(() => new Set(initialSubmittedIds));
    const [input, setInput] = useState(initialInput);
    const [author, setAuthor] = useState("");
    const [contentType, setContentType] = useState<ContentType>(initialContentType);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [pendingVoteId, setPendingVoteId] = useState<string | null>(null);
    const [boardView, setBoardView] = useState<BoardView>("all");
    const [boardTypeFilter, setBoardTypeFilter] = useState<BoardTypeFilter>("all");
    const [boardSort, setBoardSort] = useState<BoardSort>("most_voted");

    const topRequests = useMemo(
        () => sortRequests(requests.filter((request) => request.status !== "published"), "most_voted").slice(0, 3),
        [requests]
    );
    const myRequestCount = useMemo(
        () => requests.filter((request) => matchesUserRequest(request, submittedIds, votedIds)).length,
        [requests, submittedIds, votedIds]
    );
    const boardRequests = useMemo(
        () => boardView === "mine" && user
            ? requests.filter((request) => matchesUserRequest(request, submittedIds, votedIds))
            : requests,
        [boardView, requests, submittedIds, user, votedIds]
    );
    const openRequests = useMemo(
        () => sortRequests(
            boardRequests.filter((request) => request.status !== "published" && matchesTypeFilter(request, boardTypeFilter)),
            boardSort
        ),
        [boardRequests, boardSort, boardTypeFilter]
    );
    const completedRequests = useMemo(
        () => boardRequests
            .filter((request) => request.status === "published" && matchesTypeFilter(request, boardTypeFilter))
            .sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime())
            .slice(0, 6),
        [boardRequests, boardTypeFilter]
    );
    const matchingRequestCount = openRequests.length + completedRequests.length;
    const isMyRequestsEmpty = boardView === "mine" && Boolean(user) && myRequestCount === 0;
    const emptyRequestsTitle = isMyRequestsEmpty
        ? "No requests from you yet"
        : requests.length > 0 ? "No matching requests" : "No requests yet";
    const emptyRequestsCopy = isMyRequestsEmpty
        ? "Submit a source or vote on an existing request to start tracking it here."
        : requests.length > 0
        ? "Try another format filter or submit a source for this format."
        : "Submit the first source and start shaping the next batch of Netflux summaries.";

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
            if (!payload.data.duplicate) {
                setSubmittedIds((current) => {
                    const next = new Set(current);
                    next.add(payload.data.request.id);
                    return next;
                });
            }
            setBoardView("mine");
            setBoardTypeFilter("all");
            setInput("");
            setAuthor("");
            if (payload.data.duplicate) {
                toast.success("Someone already requested this.", {
                    description: "We automatically added your vote to bump it up the queue.",
                });
            } else {
                toast.success("Request added to the board.", {
                    description: "It now appears in My requests so you can track it.",
                });
            }
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

                <div className="mt-24 space-y-8 md:mt-0">
                    <div className="rounded-xl border border-border bg-card/60 p-4 shadow-sm backdrop-blur sm:p-5">
                        <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
                            <div className="min-w-40">
                                <div className="flex items-center gap-2 text-sm font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                                    <SlidersHorizontal className="size-4" />
                                    Board
                                </div>
                                <p className="mt-2 text-sm text-muted-foreground">
                                    {matchingRequestCount} matching request{matchingRequestCount !== 1 ? "s" : ""}
                                </p>
                            </div>

                            <div className="grid gap-4 lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)_13rem] xl:min-w-[52rem]">
                                <div>
                                    <p className="mb-2 text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground/80">
                                        View
                                    </p>
                                    <div className="flex flex-wrap gap-2">
                                        <button
                                            type="button"
                                            onClick={() => setBoardView("all")}
                                            className={cn(
                                                "focus-ring inline-flex h-9 items-center gap-2 rounded-full border px-3 text-sm font-medium transition-colors",
                                                boardView === "all"
                                                    ? "border-primary bg-primary text-primary-foreground"
                                                    : "border-border bg-background text-muted-foreground hover:bg-muted hover:text-foreground"
                                            )}
                                        >
                                            All
                                        </button>
                                        {user ? (
                                            <button
                                                type="button"
                                                onClick={() => setBoardView("mine")}
                                                className={cn(
                                                    "focus-ring inline-flex h-9 items-center gap-2 rounded-full border px-3 text-sm font-medium transition-colors",
                                                    boardView === "mine"
                                                        ? "border-primary bg-primary text-primary-foreground"
                                                        : "border-border bg-background text-muted-foreground hover:bg-muted hover:text-foreground"
                                                )}
                                            >
                                                Mine
                                                <span className={cn(
                                                    "rounded-full px-2 py-0.5 text-xs",
                                                    boardView === "mine" ? "bg-white/15 text-primary-foreground" : "bg-muted text-muted-foreground"
                                                )}
                                                >
                                                    {myRequestCount}
                                                </span>
                                            </button>
                                        ) : (
                                            <SignInLink className="focus-ring inline-flex h-9 items-center rounded-full border border-border bg-background px-3 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground">
                                                Sign in for mine
                                            </SignInLink>
                                        )}
                                    </div>
                                </div>

                                <div>
                                    <p className="mb-2 text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground/80">
                                        Format
                                    </p>
                                    <div className="flex flex-wrap gap-2">
                                        {BOARD_FILTER_OPTIONS.map(({ value, label, Icon }) => {
                                            const isActive = boardTypeFilter === value;

                                            return (
                                                <button
                                                    key={value}
                                                    type="button"
                                                    onClick={() => setBoardTypeFilter(value)}
                                                    className={cn(
                                                        "focus-ring inline-flex h-9 items-center gap-2 rounded-full border px-3 text-sm font-medium transition-colors",
                                                        isActive
                                                            ? "border-primary bg-primary text-primary-foreground"
                                                            : "border-border bg-background text-muted-foreground hover:bg-muted hover:text-foreground"
                                                    )}
                                                >
                                                    {Icon ? <Icon className="size-4" /> : null}
                                                    {label}
                                                </button>
                                            );
                                        })}
                                    </div>
                                </div>

                                <label className="grid gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground/80">
                                    Sort open requests
                                    <select
                                        value={boardSort}
                                        onChange={(event) => setBoardSort(event.target.value as BoardSort)}
                                        className="h-10 rounded-lg border border-border bg-background px-3 text-sm font-medium normal-case tracking-normal text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                                    >
                                        {SORT_OPTIONS.map((option) => (
                                            <option key={option.value} value={option.value}>
                                                {option.label}
                                            </option>
                                        ))}
                                    </select>
                                </label>
                            </div>
                        </div>
                    </div>

                    {completedRequests.length > 0 ? (
                        <section className="space-y-4">
                            <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
                                <div>
                                    <div className="flex items-center gap-2">
                                        <CheckCircle2 className="size-5 text-emerald-300" />
                                        <h2 className="text-xl font-semibold text-foreground">Recently completed</h2>
                                    </div>
                                    <p className="mt-1 text-sm text-muted-foreground">
                                        Summaries published from community demand.
                                    </p>
                                </div>
                            </div>
                            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                                {completedRequests.map((request) => (
                                    <RequestCard
                                        key={request.id}
                                        request={request}
                                        isVoted={votedIds.has(request.id)}
                                        isSubmitted={submittedIds.has(request.id)}
                                        isPending={false}
                                        isVotingLocked
                                    />
                                ))}
                            </div>
                        </section>
                    ) : null}

                    <section className="space-y-4">
                        <div>
                            <h2 className="text-xl font-semibold text-foreground">Open requests</h2>
                            <p className="mt-1 text-sm text-muted-foreground">
                                Vote for the sources you want the Netflux team to prioritize next.
                            </p>
                        </div>

                        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                            {openRequests.length > 0 ? openRequests.map((request) => (
                                <RequestCard
                                    key={request.id}
                                    request={request}
                                    isVoted={votedIds.has(request.id)}
                                    isSubmitted={submittedIds.has(request.id)}
                                    isPending={pendingVoteId === request.id}
                                    onVote={() => handleVote(request)}
                                />
                            )) : (
                                <div className="rounded-xl border border-dashed border-border bg-card/50 p-8 text-center md:col-span-2 xl:col-span-3">
                                    <BookOpen className="mx-auto size-10 text-muted-foreground" />
                                    <h2 className="mt-4 text-lg font-semibold text-foreground">
                                        {emptyRequestsTitle}
                                    </h2>
                                    <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">
                                        {emptyRequestsCopy}
                                    </p>
                                </div>
                            )}
                        </div>
                    </section>
                </div>
            </section>
        </div>
    );
}

function RequestCard({
    request,
    isVoted,
    isSubmitted,
    isPending,
    onVote,
    isVotingLocked = false,
}: {
    request: ContentRequestBoardItem;
    isVoted: boolean;
    isSubmitted: boolean;
    isPending: boolean;
    onVote?: () => void;
    isVotingLocked?: boolean;
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
                    {isSubmitted || isVoted ? (
                        <div className="mt-3 flex flex-wrap gap-2">
                            {isSubmitted ? (
                                <span className="rounded-full border border-primary/25 bg-primary/10 px-2.5 py-1 text-xs font-semibold text-primary">
                                    You requested
                                </span>
                            ) : null}
                            {isVoted ? (
                                <span className="rounded-full border border-emerald-400/25 bg-emerald-400/10 px-2.5 py-1 text-xs font-semibold text-emerald-100">
                                    Voted
                                </span>
                            ) : null}
                        </div>
                    ) : null}
                    {request.status === "source_unavailable" && request.source_availability_note ? (
                        <p className="mt-3 rounded-lg border border-zinc-500/20 bg-zinc-500/10 px-3 py-2 text-xs leading-5 text-zinc-200">
                            {request.source_availability_note}
                        </p>
                    ) : null}
                </div>

                <div className="mt-auto flex items-center justify-between gap-3 pt-5">
                    {isVotingLocked ? (
                        <div className="inline-flex h-10 items-center gap-2 rounded-lg border border-emerald-400/25 bg-emerald-400/10 px-3 text-sm font-semibold text-emerald-100">
                            <ThumbsUp className="size-4" />
                            {request.vote_count}
                        </div>
                    ) : (
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
                    )}

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
