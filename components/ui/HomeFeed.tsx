"use client";

import { HeroCarousel } from "@/components/ui/HeroCarousel";

import { RecommendationsRow } from "@/components/ui/RecommendationsRow";
import { ContentLane } from "@/components/ui/ContentLane";
import type { ContentItem, HomepageSection } from "@/types/database";
import { cn } from "@/lib/utils";
import { APP_NAME } from "@/lib/brand";
import { Logo } from "@/components/ui/Logo";

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
        <div className="min-h-screen bg-background">
            {/* Hero Carousel */}
            <HeroCarousel items={featuredItems} />

            <div className={cn(
                "relative z-10 pb-8 lg:pb-24 space-y-4 md:space-y-8 transition-all duration-500",
                featuredItems.length > 0 ? "-mt-8 pt-0" : "pt-24"
            )}>
                {/* Standard Feed View */}
                <div className="space-y-4 md:space-y-1 animate-in fade-in duration-500">
                    {/* New / Latest Additions */}
                    <ContentLane
                        title={
                            <div className="flex items-center gap-2">
                                New on <Logo width={100} height={30} className="inline-flex" />
                            </div>
                        }
                        items={items.slice(0, 10)}
                    />



                    {/* Personalized Recommendations */}
                    <RecommendationsRow />

                    {/* Dynamic Sections from Admin */}
                    {(sections || []).map((section) => {
                        const sectionContent = sectionItems[section.id] || [];
                        if (sectionContent.length === 0) return null;

                        return (
                            <ContentLane
                                key={section.id}
                                title={section.title}
                                items={sectionContent}
                            />
                        );
                    })}
                </div>
            </div>

            {/* Footer */}
            <footer className="border-t border-border py-4 lg:py-7 px-6 lg:px-16 mt-8 bg-card/20">
                <div className="flex flex-col md:flex-row items-center justify-between gap-6 text-sm text-muted-foreground">
                    <div className="flex items-center gap-2">
                        <div className="w-6 h-6 bg-foreground rounded-md flex items-center justify-center text-background font-display font-bold">
                            L
                        </div>
                        <p>© 2026 {APP_NAME}</p>
                    </div>
                    <div className="flex gap-8">
                        <a href="/about" className="hover:text-foreground transition-colors">About</a>
                        <a href="/privacy" className="hover:text-foreground transition-colors">Privacy</a>
                        <a href="/terms" className="hover:text-foreground transition-colors">Terms</a>
                    </div>
                </div>
            </footer>
        </div>
    );
}
