import dynamic from "next/dynamic";
import type { ContentItem } from "@/types/database";
import { HeroSection, LandingHeader } from "@/components/ui/landing/LandingHeroSections";
import { getCuratedCategories } from "@/components/ui/landing/landingCategories";
import { buildCanonicalCategoryStats } from "@/lib/content-categories";

const LandingDeferredSections = dynamic(
  () =>
    import("@/components/ui/landing/LandingDeferredSections").then(
      (mod) => mod.LandingDeferredSections
    ),
  { loading: () => null }
);

interface LandingPageProps {
  featuredItems: ContentItem[];
  categories: { category: string; count: number }[];
  totalContentCount: number;
}

export function LandingPage({ featuredItems, categories, totalContentCount }: LandingPageProps) {
  const curatedCategories = getCuratedCategories(categories);
  const totalTopicCount = buildCanonicalCategoryStats(categories).length;

  return (
    <>
      <LandingHeader />

      <main className="landing-page-shell relative min-h-screen overflow-x-clip text-foreground">
        <HeroSection
          totalContentCount={totalContentCount}
          totalTopicCount={totalTopicCount}
        />
        <LandingDeferredSections
          featuredItems={featuredItems}
          curatedCategories={curatedCategories}
          totalContentCount={totalContentCount}
        />
      </main>
    </>
  );
}
