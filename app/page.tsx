import { LandingPage } from "@/components/ui/LandingPage";
import { createPublicServerClient } from "@/lib/supabase/public-server";
import { LandingRedirectGuard } from "@/components/ui/LandingRedirectGuard";
import type { ContentItem } from "@/types/database";

export const revalidate = 3600;

const LANDING_SELECT =
  "id, type, title, author, cover_image_url, hero_image_url, category, duration_seconds, created_at, is_featured";

export default async function LandingPageRoute() {
  const landingContent = await LandingPageData();

  return (
    <>
      <LandingRedirectGuard />
      {landingContent}
    </>
  );
}

async function LandingPageData() {
  const publicSupabase = createPublicServerClient();

  const [{ data: popularItems }, { data: categoryStats }, { count: totalContent }] =
    await Promise.all([
      publicSupabase
        .from("content_item")
        .select(LANDING_SELECT)
        .eq("status", "verified")
        .is("deleted_at", null)
        .order("is_featured", { ascending: false })
        .order("created_at", { ascending: false })
        .limit(16),
      publicSupabase.rpc("get_category_stats"),
      publicSupabase
        .from("content_item")
        .select("id", { count: "exact", head: true })
        .eq("status", "verified")
        .is("deleted_at", null),
    ]);

  return (
    <LandingPage
      featuredItems={(popularItems || []) as ContentItem[]}
      categories={(categoryStats as { category: string; count: number }[] | null) || []}
      totalContentCount={totalContent || 0}
      totalCategoryCount={categoryStats?.length || 0}
    />
  );
}
