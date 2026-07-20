import type { Metadata } from "next";
import { LandingPage } from "@/components/ui/LandingPage";
import { createPublicServerClient } from "@/lib/supabase/public-server";
import { LandingRedirectGuard } from "@/components/ui/LandingRedirectGuard";
import type { ContentItem } from "@/types/database";
import { APP_NAME } from "@/lib/brand";
import { ROOT_OG_IMAGE, ROOT_OG_IMAGE_ALT, SITE_DESCRIPTION, SITE_URL } from "@/lib/seo";

export const revalidate = 3600;

const SOCIAL_TITLE = "Discover the ideas you didn’t know you needed.";

export const metadata: Metadata = {
  title: `${APP_NAME} | ${SOCIAL_TITLE}`,
  description: SITE_DESCRIPTION,
  alternates: {
    canonical: SITE_URL,
  },
  openGraph: {
    title: SOCIAL_TITLE,
    description: SITE_DESCRIPTION,
    url: SITE_URL,
    siteName: APP_NAME,
    images: [
      {
        url: ROOT_OG_IMAGE,
        width: 1200,
        height: 630,
        alt: ROOT_OG_IMAGE_ALT,
      },
    ],
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: SOCIAL_TITLE,
    description: SITE_DESCRIPTION,
    images: [ROOT_OG_IMAGE],
  },
};

const LANDING_SELECT =
  "id, type, title, author, cover_image_url, hero_image_url, category, duration_seconds, audio_url, created_at, published_at, is_featured";

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
        .order("published_at", { ascending: false })
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
    />
  );
}
