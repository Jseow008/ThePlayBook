"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
    BookOpen,
    Eye,
    FileText,
    Headphones,
    type LucideIcon,
    Loader2,
    Pencil,
    Plus,
    Sparkles,
    Star,
    StarOff,
    Trash2,
} from "lucide-react";
import { toast } from "sonner";
import { AdminSearch } from "@/components/admin/AdminSearch";
import { AiReadinessBadge } from "@/components/admin/AiReadinessBadge";
import { ContentFilters } from "@/components/admin/ContentFilters";
import { ContentQuickFilters } from "@/components/admin/ContentQuickFilters";
import { ContentSavedViews } from "@/components/admin/ContentSavedViews";
import { ContentStatusBadge } from "@/components/admin/ContentStatusBadge";
import { DeleteContentButton } from "@/components/admin/DeleteContentButton";
import { FeaturedToggle } from "@/components/admin/FeaturedToggle";
import { NarrationRowAction } from "@/components/admin/NarrationRowAction";
import { PaginationControls } from "@/components/admin/PaginationControls";
import type { AdminContentViewState } from "@/lib/admin-content-query";
import type { AdminAiReadiness } from "@/lib/server/admin-ai-readiness";
import type { AdminContentWorkbenchItem, AdminNarrationEstimateById } from "@/lib/server/admin-content-workbench";
import { getNarrationJobState } from "@/lib/narration-job";
import { APP_NAME } from "@/lib/brand";
import { buildReadPath } from "@/lib/content-paths";

type BulkAction = "publish" | "draft" | "feature" | "unfeature" | "delete" | "queue_narration";

type BulkRouteResponse = {
    data?: {
        message?: string;
        skipped?: Array<{ id: string; title: string; reason: string }>;
        skipped_count?: number;
        updated_count?: number;
        queued_count?: number;
    };
    error?: {
        message?: string;
    };
};

const typeIcons = {
    podcast: Headphones,
    book: BookOpen,
    article: FileText,
    video: Sparkles,
};

function formatAdminDate(value: string | null | undefined) {
    if (!value) {
        return "—";
    }

    return new Date(value).toLocaleDateString(undefined, {
        month: "short",
        day: "numeric",
        year: "numeric",
    });
}

export function ContentWorkbenchClient({
    items,
    aiReadinessById,
    narrationEstimatesById,
    narrationWarning,
    totalItems,
    totalPages,
    currentPage,
    pageSize,
    returnTo,
    searchQuery,
    viewState,
    basePath = "/admin/content",
    permanentFiltersEnabled = false,
}: {
    items: AdminContentWorkbenchItem[];
    aiReadinessById: Record<string, AdminAiReadiness>;
    narrationEstimatesById: AdminNarrationEstimateById;
    narrationWarning: string;
    totalItems: number;
    totalPages: number;
    currentPage: number;
    pageSize: number;
    returnTo: string;
    searchQuery: string;
    viewState: AdminContentViewState;
    basePath?: string;
    permanentFiltersEnabled?: boolean;
}) {
    const router = useRouter();
    const [selectedIds, setSelectedIds] = useState<string[]>([]);
    const [pendingAction, setPendingAction] = useState<BulkAction | null>(null);
    const [isRefreshPending, startRefreshTransition] = useTransition();
    const desktopSelectAllRef = useRef<HTMLInputElement | null>(null);
    const mobileSelectAllRef = useRef<HTMLInputElement | null>(null);
    const itemSignature = useMemo(() => items.map((item) => item.id).join(","), [items]);

    useEffect(() => {
        setSelectedIds([]);
    }, [itemSignature]);

    const allSelected = items.length > 0 && selectedIds.length === items.length;
    const someSelected = selectedIds.length > 0 && !allSelected;
    const filtersActive = viewState.status !== "all"
        || viewState.type !== "all"
        || viewState.featured
        || viewState.ai !== "all"
        || viewState.voice !== "all"
        || Boolean(searchQuery);

    useEffect(() => {
        if (desktopSelectAllRef.current) {
            desktopSelectAllRef.current.indeterminate = someSelected;
        }
        if (mobileSelectAllRef.current) {
            mobileSelectAllRef.current.indeterminate = someSelected;
        }
    }, [someSelected]);

    const bulkActions = useMemo(() => ([
        { action: "publish", label: "Publish", icon: Sparkles },
        { action: "draft", label: "Move to Draft", icon: FileText },
        { action: "feature", label: "Feature", icon: Star },
        { action: "unfeature", label: "Unfeature", icon: StarOff },
        { action: "queue_narration", label: "Regenerate Voice", icon: Headphones },
        { action: "delete", label: "Delete", icon: Trash2 },
    ] satisfies Array<{ action: BulkAction; label: string; icon: LucideIcon }>), []);

    const toggleItemSelection = (id: string) => {
        setSelectedIds((current) => (
            current.includes(id)
                ? current.filter((selectedId) => selectedId !== id)
                : [...current, id]
        ));
    };

    const toggleSelectAll = () => {
        setSelectedIds((current) => (current.length === items.length ? [] : items.map((item) => item.id)));
    };

    const runBulkAction = async (action: BulkAction) => {
        if (selectedIds.length === 0 || pendingAction) {
            return;
        }

        if (action === "delete" && !window.confirm(`Delete ${selectedIds.length} selected items?`)) {
            return;
        }

        try {
            setPendingAction(action);

            const response = await fetch("/api/admin/content/bulk", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({
                    ids: selectedIds,
                    action,
                }),
            });
            const data = await response.json() as BulkRouteResponse;

            if (!response.ok) {
                throw new Error(data.error?.message || "Bulk action failed.");
            }

            const skipped = data.data?.skipped ?? [];
            const description = skipped.length > 0
                ? skipped.slice(0, 2).map((entry) => `${entry.title}: ${entry.reason}`).join(" ")
                : undefined;

            toast.success(data.data?.message || "Bulk action completed.", description ? { description } : undefined);
            setSelectedIds([]);
            startRefreshTransition(() => {
                router.refresh();
            });
        } catch (error) {
            toast.error(error instanceof Error ? error.message : "Bulk action failed.");
        } finally {
            setPendingAction(null);
        }
    };

    return (
        <div className="space-y-8">
            {narrationWarning && (
                <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-medium text-amber-800 shadow-sm">
                    {narrationWarning}
                </div>
            )}

            <div className="flex flex-col justify-between gap-6 xl:flex-row xl:items-start">
                <div className="flex-shrink-0">
                    <h1 className="text-2xl font-bold text-foreground">Content</h1>
                    <p className="mt-1 text-muted-foreground">
                        Search, filter, and manage {APP_NAME} content items.
                    </p>
                </div>

                <div className="flex w-full flex-col items-stretch gap-3 xl:w-auto xl:min-w-[420px] xl:items-end">
                    <AdminSearch basePath={basePath} />
                    <ContentFilters
                        basePath={basePath}
                        initialPermanent={permanentFiltersEnabled}
                    />
                    <Link
                        href="/admin/content/new"
                        className="focus-ring inline-flex w-full items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2 font-medium text-primary-foreground transition-colors hover:bg-primary/90 whitespace-nowrap sm:w-auto"
                    >
                        <Plus className="w-4 h-4" />
                        New Content
                    </Link>
                </div>
            </div>

            <div className="space-y-3">
                <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
                    <ContentSavedViews basePath={basePath} />
                    <div className="text-sm text-muted-foreground">
                        {totalItems} items · {pageSize} per page
                    </div>
                </div>
                <ContentQuickFilters basePath={basePath} />
            </div>

            <div className="rounded-xl border border-border bg-card text-card-foreground shadow-sm">
                <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border bg-card px-6 py-4">
                    <div className="flex items-center gap-2">
                        <h2 className="font-semibold text-foreground">All Content</h2>
                        {filtersActive && (
                            <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
                                Filtered
                            </span>
                        )}
                    </div>
                    <span className="text-sm text-muted-foreground">
                        Page {currentPage} of {totalPages}
                    </span>
                </div>

                {selectedIds.length > 0 && (
                    <div className="flex flex-wrap items-center gap-2 border-b border-border bg-muted/35 px-6 py-3">
                        <span className="mr-2 text-sm font-medium text-foreground">
                            {selectedIds.length} selected
                        </span>
                        {bulkActions.map(({ action, label, icon: Icon }) => {
                            const isPending = pendingAction === action;
                            const isDelete = action === "delete";

                            return (
                                <button
                                    key={action}
                                    type="button"
                                    onClick={() => runBulkAction(action)}
                                    disabled={pendingAction !== null || isRefreshPending}
                                    className={`inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-60 ${isDelete
                                        ? "border-red-200 bg-red-50 text-red-700 hover:bg-red-100"
                                        : "border-border bg-card text-foreground hover:bg-muted"
                                        }`}
                                >
                                    {isPending ? <Loader2 className="size-4 animate-spin" /> : <Icon className="size-4" />}
                                    {label}
                                </button>
                            );
                        })}
                        <button
                            type="button"
                            onClick={() => setSelectedIds([])}
                            disabled={pendingAction !== null || isRefreshPending}
                            className="ml-auto rounded-lg border border-border bg-card px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:cursor-not-allowed disabled:opacity-60"
                        >
                            Clear selection
                        </button>
                    </div>
                )}

                {items.length === 0 ? (
                    <div className="bg-card px-6 py-12 text-center">
                        <BookOpen className="mx-auto mb-4 h-12 w-12 text-muted-foreground/30" />
                        <p className="mb-4 text-muted-foreground">No content found matching your filters</p>
                        <Link
                            href={basePath}
                            className="focus-ring inline-flex items-center gap-2 rounded-sm font-medium text-foreground hover:underline"
                        >
                            Clear filters
                        </Link>
                    </div>
                ) : (
                    <>
                        <div className="xl:hidden space-y-4 p-4">
                            <div className="flex items-center justify-between rounded-lg border border-border bg-muted/25 px-4 py-3">
                                <label className="flex items-center gap-2 text-sm font-medium text-foreground">
                                    <input
                                        ref={mobileSelectAllRef}
                                        type="checkbox"
                                        checked={allSelected}
                                        onChange={toggleSelectAll}
                                        className="h-4 w-4 rounded border-input text-primary focus:ring-ring"
                                        aria-label="Select all visible content"
                                    />
                                    Select all visible
                                </label>
                                <span className="text-xs text-muted-foreground">
                                    {items.length} item{items.length === 1 ? "" : "s"} on this page
                                </span>
                            </div>

                            {items.map((item) => {
                                const TypeIcon = typeIcons[item.type as keyof typeof typeIcons] || FileText;
                                const narrationJob = getNarrationJobState({
                                    audio_url: item.audio_url,
                                    narration_status: item.narration_status,
                                    narration_error: item.narration_error,
                                    narration_requested_at: item.narration_requested_at,
                                    narration_started_at: item.narration_started_at,
                                    narration_completed_at: item.narration_completed_at,
                                });

                                return (
                                    <article key={item.id} className="rounded-xl border border-border bg-card p-4 shadow-sm">
                                        <div className="flex items-start justify-between gap-3">
                                            <div className="flex min-w-0 items-start gap-3">
                                                <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
                                                    <TypeIcon className="w-5 h-5" />
                                                </div>
                                                <div className="min-w-0">
                                                    <p className="truncate font-medium text-foreground">{item.title}</p>
                                                    <p className="text-sm text-muted-foreground">{item.author || "Unknown author"}</p>
                                                </div>
                                            </div>
                                            <input
                                                type="checkbox"
                                                checked={selectedIds.includes(item.id)}
                                                onChange={() => toggleItemSelection(item.id)}
                                                className="mt-1 h-4 w-4 rounded border-input text-primary focus:ring-ring"
                                                aria-label={`Select ${item.title}`}
                                            />
                                        </div>

                                        <div className="mt-3 flex flex-wrap items-center gap-2">
                                            <AiReadinessBadge readiness={aiReadinessById[item.id]} />
                                            <span className="inline-flex items-center rounded-full border border-border bg-muted/40 px-2 py-0.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                                                {item.type}
                                            </span>
                                            <ContentStatusBadge status={item.status} />
                                        </div>

                                        <div className="mt-3 grid gap-3 rounded-lg border border-border bg-muted/20 p-3 text-sm sm:grid-cols-2">
                                            <div>
                                                <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground/80">Created</p>
                                                <p className="mt-1 text-foreground">{formatAdminDate(item.created_at)}</p>
                                            </div>
                                            <div>
                                                <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground/80">Updated</p>
                                                <p className="mt-1 text-foreground">{formatAdminDate(item.updated_at || item.created_at)}</p>
                                            </div>
                                        </div>

                                        <div className="mt-3">
                                            <NarrationRowAction
                                                contentId={item.id}
                                                contentStatus={item.status}
                                                audioUrl={narrationJob.audio_url || ""}
                                                initialStatus={narrationJob.status}
                                                initialError={narrationJob.error}
                                                initialRequestedAt={narrationJob.requested_at}
                                                initialStartedAt={narrationJob.started_at}
                                                initialCompletedAt={narrationJob.completed_at}
                                                estimate={narrationEstimatesById[item.id] ?? null}
                                            />
                                        </div>

                                        <div className="mt-3 flex flex-wrap items-center justify-between gap-3 border-t border-border pt-3">
                                            <div className="flex items-center gap-1">
                                                <FeaturedToggle
                                                    contentId={item.id}
                                                    isFeatured={item.is_featured}
                                                    title={item.title}
                                                />
                                                <Link
                                                    href={buildReadPath(item)}
                                                    target="_blank"
                                                    className="focus-ring rounded-lg p-2 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                                                    title="Preview"
                                                >
                                                    <Eye className="w-4 h-4" />
                                                </Link>
                                                <Link
                                                    href={`/admin/content/${item.id}/edit?returnTo=${encodeURIComponent(returnTo)}`}
                                                    className="focus-ring rounded-lg p-2 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                                                    title="Edit"
                                                >
                                                    <Pencil className="w-4 h-4" />
                                                </Link>
                                                <DeleteContentButton contentId={item.id} contentTitle={item.title} />
                                            </div>
                                            <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                                                {item.is_featured ? "Featured" : "Standard"}
                                            </span>
                                        </div>
                                    </article>
                                );
                            })}
                        </div>

                        <div className="hidden overflow-x-auto xl:block">
                            <div className="min-w-[980px]">
                                <div className="sticky top-0 z-10 grid grid-cols-[36px_48px_minmax(0,1fr)_148px_80px_100px_120px] gap-4 border-b border-border bg-muted/50 px-6 py-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                                    <div className="flex items-center justify-center">
                                        <input
                                            ref={desktopSelectAllRef}
                                            type="checkbox"
                                            checked={allSelected}
                                            onChange={toggleSelectAll}
                                            className="h-4 w-4 rounded border-input text-primary focus:ring-ring"
                                            aria-label="Select all visible content"
                                        />
                                    </div>
                                    <div>Type</div>
                                    <div>Details</div>
                                    <div>Dates</div>
                                    <div className="text-center">Featured</div>
                                    <div>Status</div>
                                    <div className="text-right">Actions</div>
                                </div>

                                <div className="divide-y divide-border bg-card text-card-foreground">
                                    {items.map((item) => {
                                        const TypeIcon = typeIcons[item.type as keyof typeof typeIcons] || FileText;
                                        const narrationJob = getNarrationJobState({
                                            audio_url: item.audio_url,
                                            narration_status: item.narration_status,
                                            narration_error: item.narration_error,
                                            narration_requested_at: item.narration_requested_at,
                                            narration_started_at: item.narration_started_at,
                                            narration_completed_at: item.narration_completed_at,
                                        });

                                        return (
                                            <div
                                                key={item.id}
                                                className="grid grid-cols-[36px_48px_minmax(0,1fr)_148px_80px_100px_120px] items-center gap-4 px-6 py-4 transition-colors hover:bg-muted/30"
                                            >
                                            <div className="flex items-center justify-center">
                                                <input
                                                    type="checkbox"
                                                    checked={selectedIds.includes(item.id)}
                                                    onChange={() => toggleItemSelection(item.id)}
                                                    className="h-4 w-4 rounded border-input text-primary focus:ring-ring"
                                                    aria-label={`Select ${item.title}`}
                                                />
                                            </div>

                                            <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
                                                <TypeIcon className="w-5 h-5" />
                                            </div>

                                            <div className="min-w-0">
                                                <p className="truncate font-medium text-foreground">{item.title}</p>
                                                <p className="text-sm text-muted-foreground">
                                                    {item.author || "Unknown author"}
                                                </p>
                                                <div className="mt-2 flex flex-wrap items-center gap-2">
                                                    <AiReadinessBadge readiness={aiReadinessById[item.id]} />
                                                    <span className="inline-flex items-center rounded-full border border-border bg-muted/40 px-2 py-0.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                                                        {item.type}
                                                    </span>
                                                </div>
                                                <div className="mt-2">
                                                    <NarrationRowAction
                                                        contentId={item.id}
                                                        contentStatus={item.status}
                                                        audioUrl={narrationJob.audio_url || ""}
                                                        initialStatus={narrationJob.status}
                                                        initialError={narrationJob.error}
                                                        initialRequestedAt={narrationJob.requested_at}
                                                        initialStartedAt={narrationJob.started_at}
                                                        initialCompletedAt={narrationJob.completed_at}
                                                        estimate={narrationEstimatesById[item.id] ?? null}
                                                    />
                                                </div>
                                            </div>

                                            <div className="space-y-2 text-xs text-muted-foreground">
                                                <div>
                                                    <p className="font-semibold uppercase tracking-wide text-[10px] text-muted-foreground/80">
                                                        Created
                                                    </p>
                                                    <p className="mt-1 text-sm text-foreground">{formatAdminDate(item.created_at)}</p>
                                                </div>
                                                <div>
                                                    <p className="font-semibold uppercase tracking-wide text-[10px] text-muted-foreground/80">
                                                        Updated
                                                    </p>
                                                    <p className="mt-1 text-sm text-foreground">{formatAdminDate(item.updated_at || item.created_at)}</p>
                                                </div>
                                            </div>

                                            <div className="flex justify-center">
                                                <FeaturedToggle
                                                    contentId={item.id}
                                                    isFeatured={item.is_featured}
                                                    title={item.title}
                                                />
                                            </div>

                                            <div>
                                                <ContentStatusBadge status={item.status} />
                                            </div>

                                            <div className="flex items-center justify-end gap-1">
                                                <Link
                                                    href={buildReadPath(item)}
                                                    target="_blank"
                                                    className="focus-ring rounded-lg p-2 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                                                    title="Preview"
                                                >
                                                    <Eye className="w-4 h-4" />
                                                </Link>
                                                <Link
                                                    href={`/admin/content/${item.id}/edit?returnTo=${encodeURIComponent(returnTo)}`}
                                                    className="focus-ring rounded-lg p-2 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                                                    title="Edit"
                                                >
                                                    <Pencil className="w-4 h-4" />
                                                </Link>
                                                <DeleteContentButton contentId={item.id} contentTitle={item.title} />
                                            </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        </div>
                    </>
                )}

                <PaginationControls currentPage={currentPage} totalPages={totalPages} pageSize={pageSize} />
            </div>
        </div>
    );
}
