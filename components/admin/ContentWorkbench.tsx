import Link from "next/link";
import { BookOpen, Eye, FileText, Headphones, Pencil, Plus } from "lucide-react";
import { getAdminClient } from "@/lib/supabase/admin";
import { getAdminAiReadinessMap } from "@/lib/server/admin-ai-readiness";
import { getNarrationJobState } from "@/lib/narration-job";
import { DeleteContentButton } from "@/components/admin/DeleteContentButton";
import { FeaturedToggle } from "@/components/admin/FeaturedToggle";
import { ContentFilters } from "@/components/admin/ContentFilters";
import { AdminSearch } from "@/components/admin/AdminSearch";
import { PaginationControls } from "@/components/admin/PaginationControls";
import { AiReadinessBadge } from "@/components/admin/AiReadinessBadge";
import { NarrationRowAction } from "@/components/admin/NarrationRowAction";
import { ContentStatusBadge } from "@/components/admin/ContentStatusBadge";
import { APP_NAME } from "@/lib/brand";

const typeIcons = {
    podcast: Headphones,
    book: BookOpen,
    article: FileText,
};

export async function ContentWorkbench({
    searchParams,
    basePath = "/admin/content",
}: {
    searchParams: Promise<{ page?: string; status?: string; featured?: string; q?: string; narration_warning?: string }>;
    basePath?: string;
}) {
    const supabase = getAdminClient();
    const params = await searchParams;
    const page = Number(params?.page) || 1;
    const statusFilter = params?.status;
    const featuredFilter = params?.featured === "true";
    const searchQuery = params?.q || "";
    const narrationWarning = params?.narration_warning || "";
    const returnParams = new URLSearchParams();

    if (params?.page) {
        returnParams.set("page", params.page);
    }
    if (params?.status && params.status !== "all") {
        returnParams.set("status", params.status);
    }
    if (params?.featured === "true") {
        returnParams.set("featured", "true");
    }
    if (params?.q) {
        returnParams.set("q", params.q);
    }

    const returnTo = returnParams.toString() ? `${basePath}?${returnParams.toString()}` : basePath;

    const PAGE_SIZE = 5;
    const from = (page - 1) * PAGE_SIZE;
    const to = from + PAGE_SIZE - 1;

    let query = (supabase
        .from("content_item") as any)
        .select("id, title, type, author, status, is_featured, embedding, audio_url, narration_status, narration_error, narration_requested_at, narration_started_at, narration_completed_at, created_at, updated_at, deleted_at", { count: "exact" })
        .is("deleted_at", null);

    if (statusFilter && statusFilter !== "all") {
        query = query.eq("status", statusFilter);
    }

    if (featuredFilter) {
        query = query.eq("is_featured", true);
    }

    if (searchQuery) {
        query = query.or(`title.ilike.%${searchQuery}%,author.ilike.%${searchQuery}%`);
    }

    const { data: contentItems, count, error } = await query
        .order("created_at", { ascending: false })
        .order("id", { ascending: true })
        .range(from, to);

    if (error) {
        console.error("Error fetching content:", error);
    }

    const items = contentItems || [];
    const aiReadinessById = await getAdminAiReadinessMap(
        supabase as any,
        items.map((item: any) => ({
            id: item.id,
            status: item.status,
            embedding: item.embedding,
        }))
    );
    const totalPages = count ? Math.ceil(count / PAGE_SIZE) : 1;

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

                <div className="flex flex-wrap items-center justify-start gap-3 xl:justify-end">
                    <AdminSearch basePath={basePath} />
                    <ContentFilters basePath={basePath} />
                    <Link
                        href="/admin/content/new"
                        className="focus-ring inline-flex items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2 font-medium text-primary-foreground transition-colors hover:bg-primary/90 whitespace-nowrap"
                    >
                        <Plus className="w-4 h-4" />
                        New Content
                    </Link>
                </div>
            </div>

            <div className="rounded-xl border border-border bg-card text-card-foreground shadow-sm">
                <div className="flex items-center justify-between border-b border-border bg-card px-6 py-4">
                    <div className="flex items-center gap-2">
                        <h2 className="font-semibold text-foreground">All Content</h2>
                        {(statusFilter || featuredFilter || searchQuery) && (
                            <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
                                Filtered
                            </span>
                        )}
                    </div>
                    <span className="text-sm text-muted-foreground">
                        Page {page} of {totalPages}
                    </span>
                </div>

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
                    <div className="overflow-x-auto">
                        <div className="min-w-[800px]">
                            <div className="sticky top-0 z-10 grid grid-cols-[48px_1fr_80px_100px_120px] gap-4 border-b border-border bg-muted/50 px-6 py-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                                <div>Type</div>
                                <div>Details</div>
                                <div className="text-center">Featured</div>
                                <div>Status</div>
                                <div className="text-right">Actions</div>
                            </div>

                            <div className="divide-y divide-border bg-card text-card-foreground">
                                {items.map((item: any) => {
                                    const TypeIcon = typeIcons[item.type as keyof typeof typeIcons] || FileText;
                                    const isDeleted = !!item.deleted_at;
                                    const createdDate = item.created_at
                                        ? new Date(item.created_at).toLocaleDateString()
                                        : null;
                                    const updatedDate = item.updated_at
                                        ? new Date(item.updated_at).toLocaleDateString()
                                        : null;
                                    const showUpdatedDate = Boolean(
                                        updatedDate
                                        && (!item.created_at || new Date(item.updated_at).getTime() !== new Date(item.created_at).getTime())
                                    );
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
                                            className={`grid grid-cols-[48px_1fr_80px_100px_120px] items-center gap-4 px-6 py-4 transition-colors hover:bg-muted/30 ${isDeleted ? "opacity-50 grayscale" : ""}`}
                                        >
                                            <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
                                                <TypeIcon className="w-5 h-5" />
                                            </div>

                                            <div className="min-w-0">
                                                <p className="truncate font-medium text-foreground">{item.title}</p>
                                                <p className="text-sm text-muted-foreground">
                                                    {item.author || "Unknown author"}{createdDate ? ` • ${createdDate}` : ""}
                                                </p>
                                                {showUpdatedDate && (
                                                    <p className="mt-0.5 text-xs text-muted-foreground">
                                                        Last updated {updatedDate}
                                                    </p>
                                                )}
                                                <div className="mt-2 flex flex-col items-start gap-2">
                                                    <AiReadinessBadge readiness={aiReadinessById[item.id]} />
                                                    {!isDeleted && (
                                                        <NarrationRowAction
                                                            contentId={item.id}
                                                            contentStatus={item.status}
                                                            audioUrl={narrationJob.audio_url || ""}
                                                            initialStatus={narrationJob.status}
                                                            initialError={narrationJob.error}
                                                            initialRequestedAt={narrationJob.requested_at}
                                                            initialStartedAt={narrationJob.started_at}
                                                            initialCompletedAt={narrationJob.completed_at}
                                                        />
                                                    )}
                                                </div>
                                            </div>

                                            <div className="flex justify-center">
                                                {!isDeleted && (
                                                    <FeaturedToggle
                                                        contentId={item.id}
                                                        isFeatured={item.is_featured}
                                                        title={item.title}
                                                    />
                                                )}
                                            </div>

                                            <div>
                                                <ContentStatusBadge status={item.status} deleted={isDeleted} />
                                            </div>

                                            <div className="flex items-center justify-end gap-1">
                                                {!isDeleted && (
                                                    <>
                                                        <Link
                                                            href={`/read/${item.id}`}
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
                                                    </>
                                                )}
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    </div>
                )}

                <PaginationControls currentPage={page} totalPages={totalPages} />
            </div>
        </div>
    );
}
