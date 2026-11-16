import { Instrument_Serif } from "next/font/google";
import type { ContentItem } from "@/types/database";
import { AmbientBackground } from "@/components/ui/AmbientBackground";
import { HeroSection, LandingHeader } from "@/components/ui/landing/LandingHeroSections";
import { getCuratedCategories } from "@/components/ui/landing/landingCategories";
import { LandingDeferredSections } from "@/components/ui/landing/LandingDeferredSections";

const heroFont = Instrument_Serif({
  subsets: ["latin"],
  weight: "400",
  variable: "--font-landing-hero",
  display: "swap",
});

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

      <main className={`${heroFont.variable} landing-page-shell relative min-h-screen overflow-x-clip text-foreground`}>
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
