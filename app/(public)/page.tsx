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
        <Suspense fallback={<LandingLoadingSkeleton />}>
            <LandingPage
                previewItems={(previewItems || []) as ContentItem[]}
                categories={(categoryStats as { category: string; count: number }[] | null) || []}
                totalContentCount={totalContent || 0}
                totalCategoryCount={categoryStats?.length || 0}
            />
        </Suspense>
    );
}

function LandingLoadingSkeleton() {
    return (
        <div className="min-h-screen bg-background">
            <div className="h-screen animate-pulse bg-card/10" />
        </div>
    );
}
