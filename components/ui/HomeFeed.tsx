"use client";

import Link from "next/link";

import { HeroCarousel } from "@/components/ui/HeroCarousel";

import { RecommendationsRow } from "@/components/ui/RecommendationsRow";
import { ContentLane } from "@/components/ui/ContentLane";
import type { ContentItem, HomepageSection } from "@/types/database";
import { cn } from "@/lib/utils";
import { APP_NAME } from "@/lib/brand";

interface HomeFeedProps {
    items: ContentItem[];
    featuredItems: ContentItem[];
    sections: HomepageSection[];
    sectionItems: Record<string, ContentItem[]>;

}

export function HomeFeed({
    items,
    featuredItems,
    sections,
    sectionItems,

}: HomeFeedProps) {
    return (
        <div className="flex min-h-screen flex-col bg-background">
            <div className="flex-1">
                {/* Hero Carousel */}
                <HeroCarousel items={featuredItems} />

                <div className={cn(
                    "relative z-10 pb-3 md:pb-4 lg:pb-8 space-y-3 md:space-y-8 transition-all duration-500",
                    featuredItems.length > 0 ? "-mt-5 md:-mt-8 pt-0" : "pt-16 md:pt-24"
                )}>
                    {/* Standard Feed View */}
                    <div className="space-y-8 md:space-y-10 lg:space-y-14 animate-in fade-in duration-500">
                        {/* New / Latest Additions */}
                        <ContentLane
                            title={
                                <div className="flex items-center gap-2">
                                    <span>New on </span>
                                    <span className="font-brand text-[0.95em] font-bold uppercase tracking-[0.18em]">
                                        {APP_NAME}
                                    </span>
                                </div>
                            }
                            items={items.slice(0, 10)}
                            cardTitleDensity="app-compact"
                        />

                        {/* Dynamic Sections from Admin */}
                        {(sections || []).map((section) => {
                            const sectionContent = sectionItems[section.id] || [];
                            if (sectionContent.length === 0) return null;

                            return (
                                <ContentLane
                                    key={section.id}
                                    title={section.title}
                                    items={sectionContent}
                                    cardTitleDensity="app-compact"
                                />
                            );
                        })}

                        {/* Personalized Recommendations */}
                        <RecommendationsRow cardTitleDensity="app-compact" />
                    </div>
                </div>
            </div>

            {/* Footer */}
            <footer className="border-t border-border px-4 py-8 md:px-6 lg:px-16 lg:py-12 mt-12 md:mt-20 bg-card/10 backdrop-blur-sm">
                <div className="flex flex-col md:flex-row items-center justify-between gap-6 text-sm text-muted-foreground">
                    <div className="flex items-center gap-2">
                        <div className="w-6 h-6 bg-foreground rounded-md flex items-center justify-center text-background font-display font-bold">
                            {APP_NAME.charAt(0)}
                        </div>
                        <p>© 2026 {APP_NAME}. All rights reserved.</p>
                    </div>
                    <nav aria-label="Footer navigation" className="flex gap-8">
                        <Link href="/about" className="hover:text-foreground transition-colors">About</Link>
                        <Link href="/privacy" className="hover:text-foreground transition-colors">Privacy</Link>
                        <Link href="/terms" className="hover:text-foreground transition-colors">Terms</Link>
                    </nav>
                </div>
            </footer>
        </div>
    );
}
