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
 * Showcases the product value proposition, features, and real content.
 * Authenticated users are redirected to /browse.
 */

export const revalidate = 3600; // 1 hour — landing page content is fairly static

const CONTENT_CARD_SELECT = "id, type, title, author, cover_image_url, category, duration_seconds, quick_mode_json";

export default async function LandingPageRoute() {
    // Check if user is authenticated — redirect to /browse if so
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

    const { data: { user } } = await supabase.auth.getUser();
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
    // Fetch some real content to showcase
    const publicSupabase = createPublicServerClient();

    const { data: previewItems } = await publicSupabase
        .from("content_item")
        .select(CONTENT_CARD_SELECT)
        .eq("status", "verified")
        .is("deleted_at", null)
        .order("created_at", { ascending: false })
        .limit(6);

    const { data: categoryStats } = await publicSupabase.rpc("get_category_stats");

    const { count: totalContent } = await publicSupabase
        .from("content_item")
        .select("id", { count: "exact", head: true })
        .eq("status", "verified")
        .is("deleted_at", null);

    return (
        <LandingPage
            previewItems={(previewItems || []) as ContentItem[]}
            categories={(categoryStats as { category: string; count: number }[] | null) || []}
            totalContentCount={totalContent || 0}
            totalCategoryCount={categoryStats?.length || 0}
        />
    );
}

function LandingLoadingSkeleton() {
    return (
        <div className="min-h-screen bg-background relative overflow-hidden">
            <div className="absolute inset-0 bg-gradient-to-br from-zinc-950 via-background to-zinc-900" />
            <div className="relative z-10 h-screen animate-pulse bg-card/10 flex flex-col items-center justify-center p-6">
                {/* Skeleton Hero Layout to make it feel less jarring */}
                <div className="h-12 w-3/4 max-w-2xl bg-white/5 rounded-lg mb-6" />
                <div className="h-6 w-1/2 max-w-md bg-white/5 rounded-lg mb-12" />
                <div className="flex gap-4">
                    <div className="h-12 w-36 bg-white/5 rounded-full" />
                    <div className="h-12 w-48 bg-white/10 rounded-full" />
                </div>
            </div>
        </div>
    );
}
