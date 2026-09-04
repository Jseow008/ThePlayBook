"use client";

import dynamic from "next/dynamic";
import { useState } from "react";
import { MessageCircleQuestion, BookOpen, ArrowRight, PartyPopper, BookmarkCheck, Lightbulb, Pencil } from "lucide-react";
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
}

export function CompletionCard({ contentId, title, author, segmentCount, readerTheme = "dark" }: CompletionCardProps) {
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
                {/* ── Celebration Header ────────────────────────────────────── */}
                <div className="text-center mb-6">
                    <div className="inline-flex items-center justify-center size-16 rounded-full bg-green-500/15 mb-4">
                        <PartyPopper className="size-7 text-green-500" />
                    </div>
                    <h2 className="text-2xl sm:text-3xl font-bold text-foreground mb-2">
                        You&apos;ve finished reading!
                    </h2>
                    <p className="text-muted-foreground text-sm sm:text-base max-w-md mx-auto">
                        <span className="text-foreground font-semibold">{title}</span>
                        {author && <span> by {author}</span>}
                        <span className="block mt-1 text-xs opacity-70">{segmentCount} sections completed</span>
                        {isGuest && (
                            <SignInLink className="mt-4 inline-flex items-center gap-2 rounded-full border border-primary/25 bg-primary/10 px-3.5 py-2 font-sans text-xs font-semibold leading-none text-primary shadow-sm transition-colors hover:border-primary/35 hover:bg-primary/15 hover:text-primary focus:outline-none focus:ring-2 focus:ring-primary/50 focus:ring-offset-2 focus:ring-offset-background">
                                <BookmarkCheck className="size-3.5" aria-hidden="true" />
                                <span>Sign up to save your progress.</span>
                            </SignInLink>
                        )}
                    </p>
                </div>

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
                    className={cn(
                        "group mb-4 w-full overflow-hidden rounded-2xl border border-primary/25 bg-primary/[0.07] p-5 text-left sm:p-6",
                        "transition-all duration-300 hover:border-primary/45 hover:bg-primary/[0.11]",
                        "focus:outline-none focus:ring-2 focus:ring-primary/50"
                    )}
                >
                    <div className="flex items-start gap-4">
                        <div className="flex size-12 shrink-0 items-center justify-center rounded-xl bg-primary/15 text-primary transition-colors group-hover:bg-primary/25">
                            <Lightbulb className="size-5" />
                        </div>
                        <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                                <h3 className="font-bold text-foreground text-base">
                                    {existingReflection ? "Your reflection" : "Capture a reflection"}
                                </h3>
                                {existingReflection && (
                                    <span className="rounded-full border border-primary/20 bg-primary/10 px-2 py-0.5 text-[0.68rem] font-medium text-primary">
                                        Saved
                                    </span>
                                )}
                            </div>
                            <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
                                {existingReflection
                                    ? existingReflection.reflection_text
                                    : "Pause for a moment and put the idea you want to keep in your own words."}
                            </p>
                        </div>
                        {existingReflection && <Pencil className="mt-1 size-4 shrink-0 text-primary" aria-hidden="true" />}
                    </div>
                    <div className="mt-4 flex items-center gap-1.5 text-xs font-semibold text-primary">
                        {existingReflection ? "Edit reflection" : "Write a reflection"}
                        <ArrowRight className="size-3 group-hover:translate-x-1 transition-transform" />
                    </div>
                </button>

                {/* ── Action Cards ──────────────────────────────────────────── */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
                    {/* Card A: Talk to Author */}
                    <button
                        onClick={() => setShowChat(true)}
                        className={cn(
                            "group relative overflow-hidden rounded-2xl border border-border/60 bg-card/60 p-6 text-left",
                            "hover:border-primary/40 hover:bg-primary/5 transition-all duration-300",
                            "focus:outline-none focus:ring-2 focus:ring-primary/50"
                        )}
                    >
                        <div className="flex items-start gap-4">
                            <div className="flex-shrink-0 size-12 rounded-xl bg-primary/15 flex items-center justify-center group-hover:bg-primary/25 transition-colors">
                                <MessageCircleQuestion className="size-5 text-primary" />
                            </div>
                            <div className="flex-1 min-w-0">
                                <h3 className="font-bold text-foreground text-base mb-1">
                                    Ask {authorName}
                                </h3>
                                <p className="text-sm text-muted-foreground leading-relaxed">
                                    Discuss ideas, challenge arguments, or explore concepts with the author&apos;s AI persona.
                                </p>
                            </div>
                        </div>
                        <div className="mt-4 flex items-center gap-1.5 text-xs font-semibold text-primary">
                            Start a conversation
                            <ArrowRight className="size-3 group-hover:translate-x-1 transition-transform" />
                        </div>
                    </button>

                    {/* Card B: Read Next */}
                    {isRecommendationLoading ? (
                        <div className="rounded-2xl border border-border/60 bg-card/60 p-6 flex items-center justify-center">
                            <div className="flex items-center gap-3 text-muted-foreground">
                                <div className="size-4 rounded-full border-2 border-muted-foreground/30 border-t-muted-foreground animate-spin" />
                                <span className="text-sm font-medium">Finding your next read...</span>
                            </div>
                        </div>
                    ) : recommendation ? (
                        <Link
                            href={buildReadPath(recommendation)}
                            className={cn(
                                "group relative overflow-hidden rounded-2xl border border-border/60 bg-card/60 p-6",
                                "hover:border-primary/40 hover:bg-primary/5 transition-all duration-300",
                                "focus:outline-none focus:ring-2 focus:ring-primary/50"
                            )}
                        >
                            <div className="flex items-start gap-4">
                                {recommendation.cover_image_url ? (
                                    <div className="flex-shrink-0 w-12 h-16 rounded-lg overflow-hidden bg-muted relative">
                                        <ResilientImage
                                            src={recommendation.cover_image_url}
                                            alt={recommendation.title}
                                            fill
                                            surface="completion-card"
                                            className="object-cover"
                                            sizes="48px"
                                            fallback={
                                                <div className="absolute inset-0 flex items-center justify-center bg-accent/60">
                                                    <BookOpen className="size-5 text-muted-foreground" />
                                                </div>
                                            }
                                        />
                                    </div>
                                ) : (
                                    <div className="flex-shrink-0 size-12 rounded-xl bg-accent/60 flex items-center justify-center">
                                        <BookOpen className="size-5 text-muted-foreground" />
                                    </div>
                                )}
                                <div className="flex-1 min-w-0">
                                    <h3 className="font-bold text-foreground text-base mb-1 line-clamp-2">
                                        {recommendation.title}
                                    </h3>
                                    <p className="text-sm text-muted-foreground leading-relaxed line-clamp-2">
                                        {recommendation.author && <span>by {recommendation.author}</span>}
                                        {recommendation.category && (
                                            <span className="ml-2 text-xs px-2 py-0.5 rounded-full bg-muted/80 text-muted-foreground">
                                                {recommendation.category}
                                            </span>
                                        )}
                                    </p>
                                </div>
                            </div>
                            <div className="mt-4 flex items-center gap-1.5 text-xs font-semibold text-primary">
                                Start reading
                                <ArrowRight className="size-3 group-hover:translate-x-1 transition-transform" />
                            </div>
                        </Link>
                    ) : (
                        <Link
                            href="/"
                            className={cn(
                                "group relative overflow-hidden rounded-2xl border border-border/60 bg-card/60 p-6",
                                "hover:border-primary/40 hover:bg-primary/5 transition-all duration-300",
                                "focus:outline-none focus:ring-2 focus:ring-primary/50"
                            )}
                        >
                            <div className="flex items-start gap-4">
                                <div className="flex-shrink-0 size-12 rounded-xl bg-accent/60 flex items-center justify-center">
                                    <BookOpen className="size-5 text-muted-foreground" />
                                </div>
                                <div className="flex-1 min-w-0">
                                    <h3 className="font-bold text-foreground text-base mb-1">
                                        Explore More
                                    </h3>
                                    <p className="text-sm text-muted-foreground leading-relaxed">
                                        Browse the full library and discover your next great read.
                                    </p>
                                </div>
                            </div>
                            <div className="mt-4 flex items-center gap-1.5 text-xs font-semibold text-primary">
                                Go to library
                                <ArrowRight className="size-3 group-hover:translate-x-1 transition-transform" />
                            </div>
                        </Link>
                    )}
                </div>

                {/* ── Content Feedback (muted at bottom) ──────────────────── */}
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
