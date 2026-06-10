"use client";

import type { ContentItem } from "@/types/database";
import {
  CorePlatformFeaturesSection,
  FeaturedReadsSection,
  FinalCTASection,
  LandingFooter,
} from "@/components/ui/landing/LandingPageSections";

interface LandingDeferredSectionsProps {
  featuredItems: ContentItem[];
  curatedCategories: { category: string; count: number; rawValues: string[] }[];
  totalContentCount: number;
}

export function LandingDeferredSections({
  featuredItems,
  curatedCategories,
  totalContentCount,
}: LandingDeferredSectionsProps) {
  return (
    <>
      <CorePlatformFeaturesSection />
      {featuredItems.length > 0 ? (
        <FeaturedReadsSection
          items={featuredItems}
          categories={curatedCategories}
          totalContentCount={totalContentCount}
        />
      ) : null}
      <FinalCTASection />
      <LandingFooter />
    </>
  );
}
