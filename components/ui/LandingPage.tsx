"use client";

import type { ContentItem } from "@/types/database";
import {
  CorePlatformFeaturesSection,
  FeaturedReadsSection,
  FinalCTASection,
  HeroSection,
  LandingFooter,
  LandingHeader,
  TopicMapSection,
  getCuratedCategories,
} from "@/components/ui/landing/LandingPageSections";

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
        <CorePlatformFeaturesSection />

        {featuredItems.length > 0 ? <FeaturedReadsSection items={featuredItems} /> : null}
        {curatedCategories.length > 0 ? <TopicMapSection categories={curatedCategories} /> : null}

        <FinalCTASection />
        <LandingFooter />
      </main>
    </>
  );
}
