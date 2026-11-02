"use client";

import dynamic from "next/dynamic";
import { CompletionCelebration } from "./CompletionCelebration";
import { useState } from "react";
import { MessageCircleQuestion, BookOpen, ArrowRight, PartyPopper, Lightbulb, Pencil } from "lucide-react";
import { cn } from "@/lib/utils";
import { ContentFeedback } from "@/components/ui/ContentFeedback";
import Link from "next/link";
import { ResilientImage } from "@/components/ui/ResilientImage";
import { useReadingProgress } from "@/hooks/useReadingProgress";
import { useRecommendations } from "@/hooks/use-content-queries";
import { buildReadPath } from "@/lib/content-paths";
import { SignInLink } from "@/components/ui/SignInLink";
import { OVERLAY_LAYER_CLASS } from "@/lib/overlay-layers";
import type { ReaderTheme } from "@/hooks/useReaderSettings";
import { useReflections } from "@/hooks/useReflections";
import { ReflectionComposer } from "./ReflectionComposer";
import { captureAnalyticsEvent } from "@/lib/analytics";

const AuthorChat = dynamic(
    () => import("./AuthorChat").then((mod) => mod.AuthorChat),
    {
        loading: () => (
            <div className={`fixed inset-0 ${OVERLAY_LAYER_CLASS.popover} flex items-center justify-center bg-background/95 backdrop-blur-md`}>
                <div
                    role="status"
                    className="rounded-2xl border border-border/50 bg-card/70 px-5 py-3 text-sm font-medium text-muted-foreground"
                >
                    Opening chat...
                </div>
            </div>
        ),
        ssr: false,
    }
);

interface CompletionCardProps {
    contentId: string;
    title: string;
    author: string | null;
    segmentCount: number;
    readerTheme?: ReaderTheme;
    celebrationRequested?: boolean;
    onCelebrationConsumed?: () => void;
}

export function CompletionCard({ contentId, title, author, segmentCount, readerTheme = "dark", celebrationRequested = false, onCelebrationConsumed }: CompletionCardProps) {
    const { completedIds, inProgressIds, myListIds, isLoaded, user } = useReadingProgress();
    const [showChat, setShowChat] = useState(false);
    const [showReflectionComposer, setShowReflectionComposer] = useState(false);
    const { data: recommendationItems = [], isLoading: loadingRec } = useRecommendations(
        [contentId],
        {
            enabled: isLoaded,
            excludeIds: [...completedIds, ...inProgressIds, ...myListIds],
            matchCount: 1,
        }
    );
    const recommendation = recommendationItems[0] ?? null;
    const isRecommendationLoading = !isLoaded || loadingRec;
    const isGuest = isLoaded && user === null;
    const isAuthenticated = isLoaded && user !== null;
    const { data: reflections = [] } = useReflections(contentId);
    const existingReflection = reflections[0] ?? null;

    const authorName = author || "the Author";

    return (
        <>
            <div className="animate-in fade-in slide-in-from-bottom-4 duration-700 mt-8">
                <div className="relative text-center mb-5">
                    {onCelebrationConsumed && <CompletionCelebration requested={celebrationRequested} onConsumed={onCelebrationConsumed} />}
                    <div className="inline-flex items-center justify-center size-12 rounded-full bg-green-500/15 mb-3">
                        <PartyPopper className="size-6 text-green-500" />
                    </div>
                    <h2 className="text-2xl sm:text-3xl font-bold text-foreground mb-2">
                        You&apos;ve finished reading!
                    </h2>
                    <p className="text-muted-foreground text-sm sm:text-base max-w-md mx-auto">
                        {title}
                        <span className="sr-only"> — {segmentCount} sections completed</span>
                    </p>
                </div>

                <div className="mb-6 flex flex-wrap gap-2.5">
                    <button
                        type="button"
                        onClick={() => {
                            setShowReflectionComposer(true);
                            captureAnalyticsEvent("reflection_opened", {
                                content_id: contentId,
                                route: "/read/[id]",
                                user_state: isAuthenticated ? "authenticated" : "anonymous",
                            });
                        }}
                        className="focus-ring flex min-h-[46px] flex-[1_1_210px] items-center justify-center gap-2 rounded-xl border border-border/60 bg-transparent px-3.5 py-2.5 text-sm font-medium text-foreground transition-colors hover:bg-card/60"
                    >
                        {existingReflection ? <Pencil className="size-[18px] shrink-0" aria-hidden="true" /> : <Lightbulb className="size-[18px] shrink-0" aria-hidden="true" />}
                        {existingReflection ? "Edit reflection" : "Capture a reflection"}
                    </button>
                    <button
                        type="button"
                        onClick={() => setShowChat(true)}
                        aria-label={`Ask about this with ${authorName}'s AI persona`}
                        className="focus-ring flex min-h-[46px] flex-[1_1_210px] items-center justify-center gap-2 rounded-xl border border-border/60 bg-transparent px-3.5 py-2.5 text-sm font-medium text-foreground transition-colors hover:bg-card/60"
                    >
                        <MessageCircleQuestion className="size-[18px] shrink-0" aria-hidden="true" />
                        Ask about this
                    </button>
                </div>

                <section aria-label="Your next read" className="mb-6">
                    <h3 className="mb-3 text-xs font-medium uppercase tracking-wide text-muted-foreground">Your next read</h3>
                    {isRecommendationLoading ? (
                        <div role="status" className="rounded-xl border border-border/60 bg-card/60 p-4 flex items-center justify-center">
                            <div className="flex items-center gap-3 text-muted-foreground">
                                <div className="size-4 rounded-full border-2 border-muted-foreground/30 border-t-muted-foreground animate-spin" />
                                <span className="text-sm font-medium">Finding your next read...</span>
                            </div>
                        </div>
                    ) : recommendation ? (
                        <Link
                            href={buildReadPath(recommendation)}
                            className={cn(
                                "focus-ring group flex items-center gap-4 overflow-hidden rounded-xl border border-border/60 bg-card/60 p-4",
                                "hover:border-primary/40 hover:bg-primary/5 transition-colors"
                            )}
                        >
                            <div className="relative aspect-[2/3] w-16 shrink-0 overflow-hidden rounded-lg bg-muted">
                                {recommendation.cover_image_url ? (
                                    <ResilientImage
                                        src={recommendation.cover_image_url}
                                        alt={recommendation.title}
                                        fill
                                        surface="completion-card"
                                        className="object-cover"
                                        sizes="64px"
                                        fallback={<div className="absolute inset-0 flex items-center justify-center bg-accent/60"><BookOpen className="size-5 text-muted-foreground" /></div>}
                                    />
                                ) : <div className="absolute inset-0 flex items-center justify-center bg-accent/60"><BookOpen className="size-5 text-muted-foreground" /></div>}
                            </div>
                            <div className="min-w-0 flex-1">
                                <h4 className="mb-1 line-clamp-2 text-base font-bold text-foreground">{recommendation.title}</h4>
                                <p className="line-clamp-2 text-sm leading-relaxed text-muted-foreground">
                                    {recommendation.author}
                                </p>
                                <div className="mt-3 flex items-center gap-1.5 text-xs font-semibold text-primary">
                                    Read summary
                                    <ArrowRight className="size-3 shrink-0 group-hover:translate-x-1 transition-transform" aria-hidden="true" />
                                </div>
                            </div>
                        </Link>
                    ) : (
                        <Link
                            href="/browse"
                            className={cn(
                                "focus-ring group flex items-center gap-4 overflow-hidden rounded-xl border border-border/60 bg-card/60 p-4",
                                "hover:border-primary/40 hover:bg-primary/5 transition-colors"
                            )}
                        >
                            <div className="flex size-12 shrink-0 items-center justify-center rounded-xl bg-accent/60">
                                <BookOpen className="size-5 text-muted-foreground" />
                            </div>
                            <div className="min-w-0 flex-1">
                                <h4 className="mb-1 text-base font-bold text-foreground">Explore More</h4>
                                <p className="text-sm leading-relaxed text-muted-foreground">Browse the full library and discover your next great read.</p>
                                <div className="mt-3 flex items-center gap-1.5 text-xs font-semibold text-primary">
                                    Go to library
                                    <ArrowRight className="size-3 shrink-0 group-hover:translate-x-1 transition-transform" aria-hidden="true" />
                                </div>
                            </div>
                        </Link>
                    )}
                </section>

                {isGuest && (
                    <div className="mb-6 text-center">
                        <SignInLink className="focus-ring inline-flex min-h-11 items-center rounded text-xs text-muted-foreground underline underline-offset-4 hover:text-foreground">
                            Sign in to save your progress
                        </SignInLink>
                    </div>
                )}

                <ContentFeedback contentId={contentId} />
            </div>

            {/* Author Chat Overlay */}
            {showChat && (
                <AuthorChat
                    contentId={contentId}
                    authorName={authorName}
                    contentTitle={title}
                    readerTheme={readerTheme}
                    onClose={() => setShowChat(false)}
                />
            )}

            <ReflectionComposer
                contentId={contentId}
                contentTitle={title}
                readerTheme={readerTheme}
                isOpen={showReflectionComposer}
                isAuthenticated={isAuthenticated}
                existingReflection={existingReflection}
                onClose={() => setShowReflectionComposer(false)}
                onSaved={() => setShowReflectionComposer(false)}
            />
        </>
    );
}
