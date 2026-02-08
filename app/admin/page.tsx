/**
 * Admin Dashboard
 * 
 * Lists all content items with status, type, and actions.
 */

import Link from "next/link";
import { getAdminClient } from "@/lib/supabase/admin";
import { Plus, BookOpen, Headphones, FileText, Pencil, Eye, ChevronLeft, ChevronRight } from "lucide-react";
import { DeleteContentButton } from "@/components/admin/DeleteContentButton";
import { FeaturedToggle } from "@/components/admin/FeaturedToggle";
import { ContentFilters } from "@/components/admin/ContentFilters";

// Type icons mapping
const typeIcons = {
    podcast: Headphones,
    book: BookOpen,
    article: FileText,
};

// Status badges
function StatusBadge({ status, deleted }: { status: string; deleted: boolean }) {
    if (deleted) {
        return (
            <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-red-100 text-red-700">
                Deleted
            </span>
        );
    }

    if (status === "verified") {
        return (
            <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-green-100 text-green-700">
                Published
            </span>
        );
    }

    return (
        <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-yellow-100 text-yellow-700">
            Draft
        </span>
    );
}

export default async function AdminDashboardPage({
    searchParams,
}: {
    searchParams: Promise<{ page?: string; status?: string; featured?: string }>;
}) {
    const supabase = getAdminClient();
    const params = await searchParams;
    const page = Number(params?.page) || 1;
    const statusFilter = params?.status;
    const featuredFilter = params?.featured === "true";

    const PAGE_SIZE = 10;
    const from = (page - 1) * PAGE_SIZE;
    const to = from + PAGE_SIZE - 1;

    // Fetch Stats (Active items only)
    // We fetch just status and deleted_at for all items to calculate stats efficiently
    const { data: allStatsData } = await (supabase
        .from("content_item") as any)
        .select("status, deleted_at")
        .is("deleted_at", null);

    const statsItems = allStatsData || [];
    const totalItems = statsItems.length;
    const publishedItems = statsItems.filter((i: any) => i.status === "verified").length;
    const draftItems = statsItems.filter((i: any) => i.status === "draft").length;

    // Build Query
    let query = (supabase
        .from("content_item") as any)
        .select("id, title, type, author, status, is_featured, created_at, updated_at, deleted_at", { count: "exact" })
        .is("deleted_at", null); // Default to showing non-deleted items

    // Apply Filters
    if (statusFilter && statusFilter !== "all") {
        query = query.eq("status", statusFilter);
    }

    if (featuredFilter) {
        query = query.eq("is_featured", true);
    }

    // Pagination
    const { data: contentItems, count, error } = await query
        .order("created_at", { ascending: false })
        .order("id", { ascending: true })
        .range(from, to);

    if (error) {
        console.error("Error fetching content:", error);
    }

    const items = contentItems || [];
    const totalPages = count ? Math.ceil(count / PAGE_SIZE) : 1;
    const hasNextPage = page < totalPages;
    const hasPrevPage = page > 1;

    // Helper to build pagination links keeping current filters
    const getPageLink = (newPage: number) => {
        const queryParams = new URLSearchParams();
        queryParams.set("page", newPage.toString());
        if (statusFilter) queryParams.set("status", statusFilter);
        if (featuredFilter) queryParams.set("featured", "true");
        return `/admin?${queryParams.toString()}`;
    };

    return (
        <div className="space-y-8">
            {/* Header */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-bold text-zinc-900">Content Dashboard</h1>
                    <p className="text-zinc-500 mt-1">Manage your Flux content</p>
                </div>

                <div className="flex items-center gap-3">
                    <ContentFilters />
                    <Link
                        href="/admin/content/new"
                        className="inline-flex items-center gap-2 px-4 py-2 bg-zinc-900 text-white font-medium rounded-lg hover:bg-zinc-800 transition-colors"
                    >
                        <Plus className="w-4 h-4" />
                        New Content
                    </Link>
                </div>
            </div>

            {/* Stats Cards */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="bg-white rounded-xl border border-zinc-200 p-6">
                    <p className="text-sm font-medium text-zinc-500">Total Content</p>
                    <p className="text-3xl font-bold text-zinc-900 mt-1">{totalItems}</p>
                </div>
                <div className="bg-white rounded-xl border border-zinc-200 p-6">
                    <p className="text-sm font-medium text-zinc-500">Published</p>
                    <p className="text-3xl font-bold text-green-600 mt-1">{publishedItems}</p>
                </div>
                <div className="bg-white rounded-xl border border-zinc-200 p-6">
                    <p className="text-sm font-medium text-zinc-500">Drafts</p>
                    <p className="text-3xl font-bold text-yellow-600 mt-1">{draftItems}</p>
                </div>
            </div>

            {/* Content Table */}
            <div className="bg-white rounded-xl border border-zinc-200 overflow-hidden">
                <div className="px-6 py-4 border-b border-zinc-200 flex justify-between items-center">
                    <div className="flex items-center gap-2">
                        <h2 className="font-semibold text-zinc-900">All Content</h2>
                        {(statusFilter || featuredFilter) && (
                            <span className="px-2 py-0.5 rounded-full bg-zinc-100 text-xs font-medium text-zinc-600">
                                Filtered
                            </span>
                        )}
                    </div>
                    <span className="text-sm text-zinc-500">
                        Page {page} of {totalPages}
                    </span>
                </div>

                {items.length === 0 ? (
                    <div className="px-6 py-12 text-center">
                        <BookOpen className="w-12 h-12 text-zinc-300 mx-auto mb-4" />
                        <p className="text-zinc-500 mb-4">No content found matching your filters</p>
                        <Link
                            href="/admin"
                            className="inline-flex items-center gap-2 text-zinc-900 font-medium hover:underline"
                        >
                            Clear filters
                        </Link>
                    </div>
                ) : (
                    <>
                        {/* Table Header - Fixed columns for alignment */}
                        <div className="grid grid-cols-[48px_1fr_80px_100px_100px] gap-4 px-6 py-3 bg-zinc-50 border-b border-zinc-200 text-xs font-semibold text-zinc-500 uppercase tracking-wider">
                            <div>Type</div>
                            <div>Details</div>
                            <div className="text-center">Featured</div>
                            <div>Status</div>
                            <div className="text-right">Actions</div>
                        </div>

                        <div className="divide-y divide-zinc-100">
                            {items.map((item: any) => {
                                const TypeIcon = typeIcons[item.type as keyof typeof typeIcons] || FileText;
                                const isDeleted = !!item.deleted_at;

                                return (
                                    <div
                                        key={item.id}
                                        className={`grid grid-cols-[48px_1fr_80px_100px_100px] items-center gap-4 px-6 py-4 ${isDeleted ? "opacity-50" : ""}`}
                                    >
                                        {/* Type Icon */}
                                        <div className="w-10 h-10 rounded-lg bg-zinc-100 flex items-center justify-center flex-shrink-0">
                                            <TypeIcon className="w-5 h-5 text-zinc-600" />
                                        </div>

                                        {/* Content Info */}
                                        <div className="min-w-0">
                                            <p className="font-medium text-zinc-900 truncate">
                                                {item.title}
                                            </p>
                                            <p className="text-sm text-zinc-500">
                                                {item.author || "Unknown author"} • {new Date(item.created_at).toLocaleDateString()}
                                            </p>
                                        </div>

                                        {/* Featured Toggle */}
                                        <div className="flex justify-center">
                                            {!isDeleted && (
                                                <FeaturedToggle
                                                    contentId={item.id}
                                                    isFeatured={item.is_featured}
                                                    title={item.title}
                                                />
                                            )}
                                        </div>

                                        {/* Status */}
                                        <div>
                                            <StatusBadge status={item.status} deleted={isDeleted} />
                                        </div>

                                        {/* Actions */}
                                        <div className="flex items-center justify-end gap-2">
                                            {!isDeleted && (
                                                <>
                                                    <Link
                                                        href={`/read/${item.id}`}
                                                        target="_blank"
                                                        className="p-2 text-zinc-400 hover:text-zinc-600 hover:bg-zinc-100 rounded-lg transition-colors"
                                                        title="Preview"
                                                    >
                                                        <Eye className="w-4 h-4" />
                                                    </Link>
                                                    <Link
                                                        href={`/admin/content/${item.id}/edit`}
                                                        className="p-2 text-zinc-400 hover:text-zinc-600 hover:bg-zinc-100 rounded-lg transition-colors"
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
                    </>
                )}

                {/* Pagination Controls */}
                {items.length > 0 && (
                    <div className="px-6 py-4 border-t border-zinc-200 bg-zinc-50 flex items-center justify-between">
                        <Link
                            href={hasPrevPage ? getPageLink(page - 1) : "#"}
                            className={`flex items-center gap-1 px-3 py-2 rounded-lg border text-sm font-medium transition-colors ${hasPrevPage
                                ? "bg-white border-zinc-300 text-zinc-700 hover:bg-zinc-50"
                                : "bg-zinc-100 border-zinc-200 text-zinc-400 cursor-not-allowed"
                                }`}
                            aria-disabled={!hasPrevPage}
                        >
                            <ChevronLeft className="w-4 h-4" />
                            Previous
                        </Link>

                        <div className="text-sm text-zinc-500">
                            Showing <span className="font-medium">{from + 1}</span> to <span className="font-medium">{Math.min(to + 1, count || 0)}</span> of <span className="font-medium">{count}</span> results
                        </div>

                        <Link
                            href={hasNextPage ? getPageLink(page + 1) : "#"}
                            className={`flex items-center gap-1 px-3 py-2 rounded-lg border text-sm font-medium transition-colors ${hasNextPage
                                ? "bg-white border-zinc-300 text-zinc-700 hover:bg-zinc-50"
                                : "bg-zinc-100 border-zinc-200 text-zinc-400 cursor-not-allowed"
                                }`}
                            aria-disabled={!hasNextPage}
                        >
                            Next
                            <ChevronRight className="w-4 h-4" />
                        </Link>
                    </div>
                )}
            </div>
        </div>
    );
}
