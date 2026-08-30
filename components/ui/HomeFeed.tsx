"use client";

import Link from "next/link";

import { HeroCarousel } from "@/components/ui/HeroCarousel";

import { RecommendationsRow } from "@/components/ui/RecommendationsRow";
import { PersonalizedTopicsRow } from "@/components/ui/PersonalizedTopicsRow";
import { ContentLane } from "@/components/ui/ContentLane";
import { Logo } from "@/components/ui/Logo";
import type { ContentItem, HomepageSection } from "@/types/database";
import { cn } from "@/lib/utils";
import { APP_NAME } from "@/lib/brand";
import {
    BROWSE_LANE_ITEM_LIMIT,
    getBrowseSectionViewAllHref,
    hasMoreBrowseItems,
} from "@/lib/browse-lanes";

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

                <div
                    className={cn(
                        "relative z-10 space-y-3 pb-3 transition-all duration-500 md:space-y-8 md:pb-0",
                        featuredItems.length > 0
                            ? "-mt-5 md:-mt-8 pt-0"
                            : "pt-16 md:pt-24",
                    )}
                >
                    {/* Standard Feed View */}
                    <div className="space-y-8 md:space-y-10 lg:space-y-14 animate-in fade-in duration-500">
                        <PersonalizedTopicsRow />
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
                            items={items.slice(0, BROWSE_LANE_ITEM_LIMIT)}
                            viewAllHref={
                                hasMoreBrowseItems(items)
                                    ? "/search"
                                    : undefined
                            }
                            cardTitleDensity="app-compact"
                            showCardDesktopQuickActions
                            showCardUserCompletionBadge
                        />

                        {/* Dynamic Sections from Admin */}
                        {(sections || []).map((section) => {
                            const sectionContent =
                                sectionItems[section.id] || [];
                            if (sectionContent.length === 0) return null;

                            return (
                                <ContentLane
                                    key={section.id}
                                    title={section.title}
                                    items={sectionContent.slice(
                                        0,
                                        BROWSE_LANE_ITEM_LIMIT,
                                    )}
                                    viewAllHref={
                                        hasMoreBrowseItems(sectionContent)
                                            ? getBrowseSectionViewAllHref(
                                                  section,
                                              )
                                            : undefined
                                    }
                                    cardTitleDensity="app-compact"
                                    showCardDesktopQuickActions
                                    showCardUserCompletionBadge
                                />
                            );
                        })}

                        {/* Personalized Recommendations */}
                        <RecommendationsRow
                            cardTitleDensity="app-compact"
                            showDesktopQuickActions
                            showUserCompletionBadge
                        />
                    </div>

                    <section
                        aria-labelledby="browse-recovery-title"
                        className="hidden px-6 pt-2 md:block lg:px-16"
                    >
                        <div className="flex items-center justify-between gap-8 border-t border-border py-6 lg:py-8">
                            <div>
                                <h2
                                    id="browse-recovery-title"
                                    className="font-display text-lg font-semibold tracking-tight text-foreground"
                                >
                                    Haven&apos;t found the right summary?
                                </h2>
                                <p className="mt-1 text-sm text-muted-foreground">
                                    Search the full catalog or ask Netflux for a
                                    recommendation.
                                </p>
                            </div>

                            <div className="flex shrink-0 items-center gap-3">
                                <Link
                                    href="/search"
                                    className="focus-ring touch-target-44 inline-flex min-h-10 items-center justify-center rounded-full bg-primary px-5 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90"
                                >
                                    Search all summaries
                                </Link>
                                <Link
                                    href="/ask"
                                    className="focus-ring touch-target-44 inline-flex min-h-10 items-center justify-center rounded-full border border-border bg-transparent px-5 text-sm font-semibold text-foreground transition-colors hover:bg-muted/50"
                                >
                                    Ask Netflux
                                </Link>
                            </div>
                        </div>
                    </section>
                </div>
            </div>

            {/* Footer */}
            <footer className="mt-8 border-t border-border bg-card/10 px-4 py-8 backdrop-blur-sm md:mt-0 md:px-6 lg:px-16 lg:py-8">
                <div className="flex flex-col md:flex-row items-center justify-between gap-6 text-sm text-muted-foreground">
                    <div className="flex flex-col items-center gap-3 md:items-start">
                        <Link
                            href="/"
                            className="focus-ring touch-target-44 inline-flex rounded-sm"
                        >
                            <Logo
                                width={96}
                                height={26}
                                className="brightness-110 drop-shadow-[0_1px_8px_rgba(255,255,255,0.06)]"
                            />
                        </Link>
                        <div className="space-y-1 text-center md:text-left">
                            <p>
                                Turn what you read into a personal knowledge
                                library.
                            </p>
                            <p>© 2026 {APP_NAME}. All rights reserved.</p>
                        </div>
                    </div>
                    <nav
                        aria-label="Footer navigation"
                        className="flex flex-wrap items-center justify-center gap-x-8 gap-y-3"
                    >
                        <Link
                            href="/browse"
                            className="focus-ring touch-target-44 inline-flex rounded-sm transition-colors hover:text-foreground"
                        >
                            Browse
                        </Link>
                        <Link
                            href="/about"
                            className="focus-ring touch-target-44 inline-flex rounded-sm transition-colors hover:text-foreground"
                        >
                            About
                        </Link>
                        <Link
                            href="mailto:javierseowww@gmail.com"
                            className="focus-ring touch-target-44 inline-flex rounded-sm transition-colors hover:text-foreground"
                        >
                            Contact
                        </Link>
                        <Link
                            href="/privacy"
                            className="focus-ring touch-target-44 inline-flex rounded-sm transition-colors hover:text-foreground"
                        >
                            Privacy
                        </Link>
                        <Link
                            href="/terms"
                            className="focus-ring touch-target-44 inline-flex rounded-sm transition-colors hover:text-foreground"
                        >
                            Terms
                        </Link>
                    </nav>
                </div>
            </footer>
        </div>
    );
}
