import { Suspense } from "react";
import { createPublicServerClient } from "@/lib/supabase/public-server";
import { LandingPage } from "@/components/ui/LandingPage";
import type { ContentItem } from "@/types/database";
import { redirect } from "next/navigation";
import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { cookies } from "next/headers";
import type { Database } from "@/types/database";

/**
 * Landing Page
 *
 * Marketing page for unauthenticated visitors.
 * Authenticated users are redirected to /browse.
 */

export const revalidate = 3600;

const LANDING_SELECT = "id, type, title, author, cover_image_url, hero_image_url, category, duration_seconds";

export default async function LandingPageRoute() {
  const cookieStore = await cookies();
  const supabase = createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet: { name: string; value: string; options: CookieOptions }[]) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          } catch {
            // Ignore - we're in a Server Component
          }
        },
      },
    }
  );

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

  // Fetch the latest 10 verified items
  const { data: latestItems } = await publicSupabase
    .from("content_item")
    .select(LANDING_SELECT)
    .eq("status", "verified")
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .limit(10);

  const { data: categoryStats } = await publicSupabase.rpc("get_category_stats");

  const { count: totalContent } = await publicSupabase
    .from("content_item")
    .select("id", { count: "exact", head: true })
    .eq("status", "verified")
    .is("deleted_at", null);

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
      <div className="relative z-10 flex min-h-screen animate-pulse items-center justify-center p-6">
        <div className="w-full max-w-6xl space-y-6">
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
