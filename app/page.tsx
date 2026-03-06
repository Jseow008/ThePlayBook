import { Suspense } from "react";
import { redirect } from "next/navigation";
import { LandingPage } from "@/components/ui/LandingPage";
import { createPublicServerClient } from "@/lib/supabase/public-server";
import { createClient } from "@/lib/supabase/server";
import type { ContentItem } from "@/types/database";

export const revalidate = 3600;

const LANDING_SELECT =
  "id, type, title, author, cover_image_url, hero_image_url, category, duration_seconds, created_at";

export default async function LandingPageRoute() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (user) {
    redirect("/browse");
  }

  return (
    <Suspense fallback={<LandingLoadingSkeleton />}>
      <LandingPageData />
    </Suspense>
  );
}

async function LandingPageData() {
  const publicSupabase = createPublicServerClient();

  const [{ data: latestItems }, { data: categoryStats }, { count: totalContent }] =
    await Promise.all([
      publicSupabase
        .from("content_item")
        .select(LANDING_SELECT)
        .eq("status", "verified")
        .is("deleted_at", null)
        .order("created_at", { ascending: false })
        .limit(10),
      publicSupabase.rpc("get_category_stats"),
      publicSupabase
        .from("content_item")
        .select("id", { count: "exact", head: true })
        .eq("status", "verified")
        .is("deleted_at", null),
    ]);

  return (
    <LandingPage
      featuredItems={(latestItems || []) as ContentItem[]}
      categories={(categoryStats as { category: string; count: number }[] | null) || []}
      totalContentCount={totalContent || 0}
      totalCategoryCount={categoryStats?.length || 0}
    />
  );
}

function LandingLoadingSkeleton() {
  return (
    <div className="relative min-h-screen overflow-hidden bg-background">
      <div className="absolute inset-0 bg-gradient-to-br from-zinc-950 via-background to-zinc-900" />
      <div className="relative z-10 flex min-h-screen items-center justify-center p-6">
        <div className="w-full max-w-6xl space-y-6 animate-pulse">
          <div className="h-12 w-28 rounded-lg bg-white/5" />
          <div className="h-16 w-3/4 max-w-3xl rounded-lg bg-white/5" />
          <div className="h-6 w-2/3 max-w-xl rounded-lg bg-white/5" />
          <div className="flex gap-4">
            <div className="h-12 w-36 rounded-full bg-white/10" />
            <div className="h-12 w-48 rounded-full bg-white/5" />
          </div>
          <div className="h-[420px] rounded-[28px] border border-white/5 bg-white/5" />
        </div>
      </div>
    </div>
  );
}
