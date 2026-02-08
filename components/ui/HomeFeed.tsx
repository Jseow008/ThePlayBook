"use client";

import { HeroCarousel } from "@/components/ui/HeroCarousel";
import { ContinueReadingRow } from "@/components/ui/ContinueReadingRow";
import { ContentLane } from "@/components/ui/ContentLane";
import type { ContentItem, HomepageSection } from "@/types/database";
import { cn } from "@/lib/utils";

interface HomeFeedProps {
    items: ContentItem[];
    featuredItems: ContentItem[];
    sections: HomepageSection[];
    sectionItems: Record<string, ContentItem[]>;
}

export function HomeFeed({ items, featuredItems, sections, sectionItems }: HomeFeedProps) {
    return (
        <div className="min-h-screen bg-background">
            {/* Hero Carousel */}
            <HeroCarousel items={featuredItems} />

            <div className={cn(
                "relative z-10 pb-16 space-y-8 transition-all duration-500",
                featuredItems.length > 0 ? "pt-8" : "pt-24"
            )}>
                {/* Standard Feed View */}
                <div className="space-y-8 animate-in fade-in duration-500">
                    {/* New / Latest Additions */}
                    <ContentLane
                        title="New on Flux"
                        items={items.slice(0, 10)}
                    />

                    {/* Continue Reading (Moved below New) */}
                    <ContinueReadingRow />

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
            <footer className="border-t border-zinc-800/50 py-12 px-6 lg:px-16 mt-12 bg-black/20">
                <div className="flex flex-col md:flex-row items-center justify-between gap-6 text-sm text-muted-foreground">
                    <div className="flex items-center gap-2">
                        <div className="w-6 h-6 bg-white rounded-md flex items-center justify-center text-black font-serif font-bold">
                            L
                        </div>
                        <p>© 2026 Flux</p>
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
