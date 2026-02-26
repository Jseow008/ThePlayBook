"use client";

import { useState, useEffect } from "react";
import { Sparkles, BookOpen, ArrowRight, PartyPopper } from "lucide-react";
import { cn } from "@/lib/utils";
import { AuthorChat } from "./AuthorChat";
import { ContentFeedback } from "@/components/ui/ContentFeedback";
import Link from "next/link";
import Image from "next/image";

interface RecommendedBook {
    id: string;
    title: string;
    author: string | null;
    cover_image_url: string | null;
    category: string | null;
    similarity: number;
}

interface CompletionCardProps {
    contentId: string;
    title: string;
    author: string | null;
    segmentCount: number;
}

export function CompletionCard({ contentId, title, author, segmentCount }: CompletionCardProps) {
    const [showChat, setShowChat] = useState(false);
    const [recommendation, setRecommendation] = useState<RecommendedBook | null>(null);
    const [loadingRec, setLoadingRec] = useState(true);

    // Fetch embedding-based recommendation
    useEffect(() => {
        const fetchRecommendation = async () => {
            try {
                const res = await fetch("/api/recommendations", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ completedIds: [contentId] }),
                });

                if (res.ok) {
                    const data = await res.json();
                    if (Array.isArray(data) && data.length > 0) {
                        setRecommendation(data[0]);
                    }
                }
            } catch (err) {
                console.error("Failed to fetch recommendation", err);
            } finally {
                setLoadingRec(false);
            }
        };

        fetchRecommendation();
    }, [contentId]);

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
                    </p>
                </div>

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
                                <Sparkles className="size-5 text-primary" />
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
                            Start conversation
                            <ArrowRight className="size-3 group-hover:translate-x-1 transition-transform" />
                        </div>
                    </button>

                    {/* Card B: Read Next */}
                    {loadingRec ? (
                        <div className="rounded-2xl border border-border/60 bg-card/60 p-6 flex items-center justify-center">
                            <div className="flex items-center gap-3 text-muted-foreground">
                                <div className="size-4 rounded-full border-2 border-muted-foreground/30 border-t-muted-foreground animate-spin" />
                                <span className="text-sm font-medium">Finding your next read...</span>
                            </div>
                        </div>
                    ) : recommendation ? (
                        <Link
                            href={`/read/${recommendation.id}`}
                            className={cn(
                                "group relative overflow-hidden rounded-2xl border border-border/60 bg-card/60 p-6",
                                "hover:border-primary/40 hover:bg-primary/5 transition-all duration-300",
                                "focus:outline-none focus:ring-2 focus:ring-primary/50"
                            )}
                        >
                            <div className="flex items-start gap-4">
                                {recommendation.cover_image_url ? (
                                    <div className="flex-shrink-0 w-12 h-16 rounded-lg overflow-hidden bg-muted relative">
                                        <Image
                                            src={recommendation.cover_image_url}
                                            alt={recommendation.title}
                                            fill
                                            className="object-cover"
                                            sizes="48px"
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
                    bookTitle={title}
                    onClose={() => setShowChat(false)}
                />
            )}
        </>
    );
}
