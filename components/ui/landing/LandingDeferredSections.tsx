"use client";

import type { ContentItem } from "@/types/database";
import {
  CorePlatformFeaturesSection,
  FeaturedReadsSection,
  FinalCTASection,
  LandingFooter,
  TopicMapSection,
} from "@/components/ui/landing/LandingPageSections";

interface LandingDeferredSectionsProps {
  featuredItems: ContentItem[];
  curatedCategories: { category: string; count: number; rawValues: string[] }[];
}

export function LandingDeferredSections({
  featuredItems,
  curatedCategories,
}: LandingDeferredSectionsProps) {
  return (
    <>
      <CorePlatformFeaturesSection />
      {featuredItems.length > 0 ? <FeaturedReadsSection items={featuredItems} /> : null}
      {curatedCategories.length > 0 ? <TopicMapSection categories={curatedCategories} /> : null}
      <FinalCTASection />
      <LandingFooter />
    </>
  );
}
