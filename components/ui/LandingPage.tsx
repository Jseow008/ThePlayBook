import dynamic from "next/dynamic";
import type { ContentItem } from "@/types/database";
import { AmbientBackground } from "@/components/ui/AmbientBackground";
import { HeroSection, LandingHeader } from "@/components/ui/landing/LandingHeroSections";
import { getCuratedCategories } from "@/components/ui/landing/landingCategories";

const LandingDeferredSections = dynamic(
  () =>
    import("@/components/ui/landing/LandingDeferredSections").then(
      (mod) => mod.LandingDeferredSections
    ),
  {
    loading: () => (
      <div aria-hidden="true" className="mx-auto min-h-[72rem] max-w-7xl animate-pulse px-4 py-16 sm:px-6">
        <div className="h-8 w-48 rounded-full bg-white/[0.06]" />
        <div className="mt-8 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }, (_, index) => (
            <div key={index} className="h-64 rounded-3xl border border-white/[0.06] bg-white/[0.025]" />
          ))}
        </div>
      </div>
    ),
  }
);

interface LandingPageProps {
  featuredItems: ContentItem[];
  categories: { category: string; count: number }[];
  totalContentCount: number;
}

export function LandingPage({ featuredItems, categories, totalContentCount }: LandingPageProps) {
  const curatedCategories = getCuratedCategories(categories);

  return (
    <>
      <AmbientBackground />
      <LandingHeader />

      <main className="landing-page-shell relative min-h-screen overflow-x-clip text-foreground">
        <HeroSection />
        <LandingDeferredSections
          featuredItems={featuredItems}
          curatedCategories={curatedCategories}
          totalContentCount={totalContentCount}
        />
      </main>
    </>
  );
}
