import dynamic from "next/dynamic";
import type { ContentItem } from "@/types/database";
import { HeroSection, LandingHeader } from "@/components/ui/landing/LandingHeroSections";
import { getCuratedCategories } from "@/components/ui/landing/landingCategories";

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
  totalCategoryCount?: number;
}

export function LandingPage({ featuredItems, categories }: LandingPageProps) {
  const curatedCategories = getCuratedCategories(categories);

  return (
    <>
      <LandingHeader />

      <main className="landing-page-shell relative min-h-screen overflow-x-hidden text-foreground">
        <HeroSection />
        <LandingDeferredSections
          featuredItems={featuredItems}
          curatedCategories={curatedCategories}
        />
      </main>
    </>
  );
}
