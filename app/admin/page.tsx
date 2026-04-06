import Link from "next/link";
import { ArrowRight, BookOpen, FileText, Plus, Sparkles } from "lucide-react";
import { getAdminClient } from "@/lib/supabase/admin";
import { LaunchReadinessPanel } from "@/components/admin/LaunchReadinessPanel";
import { ContentStatusBadge } from "@/components/admin/ContentStatusBadge";
import { MaintenancePanel } from "@/components/admin/MaintenancePanel";
import { APP_NAME } from "@/lib/brand";

export default async function AdminDashboardPage({
    searchParams,
}: {
    searchParams?: Promise<{ narration_warning?: string }>;
}) {
    const resolvedSearchParams = await searchParams;
    const narrationWarning = resolvedSearchParams?.narration_warning || "";
    const supabase = getAdminClient();

    const { data: allStatsData } = await (supabase
        .from("content_item") as any)
        .select("status, deleted_at")
        .is("deleted_at", null);

    const { data: recentContent, error: recentContentError } = await (supabase
        .from("content_item") as any)
        .select("id, title, author, status, created_at, updated_at, deleted_at")
        .is("deleted_at", null)
        .order("created_at", { ascending: false })
        .limit(5);

    if (recentContentError) {
        console.error("Error fetching recent admin content:", recentContentError);
    }

    const statsItems = allStatsData || [];
    const totalItems = statsItems.length;
    const publishedItems = statsItems.filter((item: any) => item.status === "verified").length;
    const draftItems = statsItems.filter((item: any) => item.status === "draft").length;

    const summaryCards = [
        {
            label: "Total Content",
            value: totalItems,
            accent: "text-foreground",
            Icon: BookOpen,
            href: "/admin/content",
        },
        {
            label: "Published",
            value: publishedItems,
            accent: "text-emerald-600",
            Icon: Sparkles,
            href: "/admin/content?status=verified",
        },
        {
            label: "Drafts",
            value: draftItems,
            accent: "text-amber-500",
            Icon: FileText,
            href: "/admin/content?status=draft",
        },
    ] as const;

    return (
        <div className="space-y-8">
            {narrationWarning ? (
                <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-medium text-amber-800 shadow-sm">
                    {narrationWarning}
                </div>
            ) : null}

            <div className="flex flex-col gap-6 xl:flex-row xl:items-start xl:justify-between">
                <div>
                    <h1 className="text-2xl font-bold text-foreground">Admin Dashboard</h1>
                    <p className="mt-1 text-muted-foreground">
                        Oversee launch readiness, maintenance tasks, and the current {APP_NAME} content pipeline.
                    </p>
                </div>

                <div className="flex flex-wrap gap-3">
                    <Link
                        href="/admin/content"
                        className="focus-ring inline-flex items-center justify-center gap-2 rounded-lg border border-border bg-card px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-muted"
                    >
                        Open Content
                        <ArrowRight className="size-4" />
                    </Link>
                    <Link
                        href="/admin/content/new"
                        className="focus-ring inline-flex items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
                    >
                        <Plus className="size-4" />
                        New Content
                    </Link>
                </div>
            </div>

            <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                {summaryCards.map(({ label, value, accent, Icon, href }) => (
                    <Link
                        key={label}
                        href={href}
                        className="relative overflow-hidden rounded-xl border border-border bg-card p-6 text-card-foreground shadow-sm transition-colors hover:bg-muted/20"
                    >
                        <div className="relative z-10">
                            <p className="text-sm font-medium text-muted-foreground">{label}</p>
                            <p className={`mt-1 text-3xl font-bold ${accent}`}>{value}</p>
                        </div>
                        <Icon className="absolute -bottom-4 -right-4 z-0 h-24 w-24 text-muted/20" strokeWidth={1} />
                    </Link>
                ))}
            </div>

            <LaunchReadinessPanel />

            <div className="grid gap-6 xl:items-start xl:grid-cols-[minmax(0,1fr)_24rem]">
                <section className="rounded-xl border border-border bg-card text-card-foreground shadow-sm">
                    <div className="flex items-center justify-between border-b border-border px-6 py-4">
                        <div>
                            <h2 className="font-semibold text-foreground">Recent Content</h2>
                            <p className="text-sm text-muted-foreground">
                                Latest items entering the content pipeline.
                            </p>
                        </div>
                        <Link
                            href="/admin/content"
                            className="focus-ring text-sm font-medium text-foreground transition-colors hover:text-primary"
                        >
                            View all
                        </Link>
                    </div>

                    {recentContent && recentContent.length > 0 ? (
                        <div className="divide-y divide-border">
                            {recentContent.map((item: any) => (
                                <div
                                    key={item.id}
                                    className="flex flex-col gap-3 px-6 py-4 sm:flex-row sm:items-center sm:justify-between"
                                >
                                    <div className="min-w-0">
                                        <p className="truncate font-medium text-foreground">{item.title}</p>
                                        <p className="text-sm text-muted-foreground">
                                            {item.author || "Unknown author"} • Updated{" "}
                                            {new Date(item.updated_at || item.created_at).toLocaleDateString()}
                                        </p>
                                    </div>
                                    <div className="flex items-center gap-3">
                                        <ContentStatusBadge status={item.status} />
                                        <Link
                                            href={`/admin/content/${item.id}/edit?returnTo=${encodeURIComponent("/admin")}`}
                                            className="focus-ring inline-flex items-center gap-2 rounded-lg border border-border bg-background px-3 py-2 text-sm font-medium text-foreground transition-colors hover:bg-muted"
                                        >
                                            Edit
                                        </Link>
                                    </div>
                                </div>
                            ))}
                        </div>
                    ) : (
                        <div className="px-6 py-10 text-sm text-muted-foreground">
                            No content items found yet.
                        </div>
                    )}
                </section>

                <div className="space-y-6">
                    <section className="rounded-xl border border-border bg-card px-6 py-5 text-card-foreground shadow-sm">
                        <div>
                            <h2 className="font-semibold text-foreground">Content Workbench</h2>
                            <p className="mt-1 text-sm text-muted-foreground">
                                Search, filter, and manage the full library without the operational widgets in the way.
                            </p>
                        </div>
                        <div className="mt-4 space-y-3">
                            <Link
                                href="/admin/content?status=draft"
                                className="focus-ring flex items-center justify-between rounded-lg border border-border bg-background px-4 py-3 text-sm font-medium text-foreground transition-colors hover:bg-muted"
                            >
                                Review drafts
                                <ArrowRight className="size-4" />
                            </Link>
                            <Link
                                href="/admin/content?featured=true"
                                className="focus-ring flex items-center justify-between rounded-lg border border-border bg-background px-4 py-3 text-sm font-medium text-foreground transition-colors hover:bg-muted"
                            >
                                Check featured items
                                <ArrowRight className="size-4" />
                            </Link>
                        </div>
                    </section>

                    <MaintenancePanel />
                </div>
            </div>
        </div>
    );
}
