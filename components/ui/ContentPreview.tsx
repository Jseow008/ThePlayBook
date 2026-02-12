"use client";

import Link from "next/link";
import { ArrowLeft, Clock, Sparkles, BookOpen } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import type { ContentItem } from "@/types/database";
import type { QuickMode } from "@/types/domain";

interface ContentPreviewProps {
    item: ContentItem;
    segmentCount?: number | null;
    onSpinAgain?: () => void;
    isSpinning?: boolean;
    ctaIcon?: React.ElementType;
}

export function ContentPreview({
    item,
    segmentCount,
    onSpinAgain,
    isSpinning = false,
    ctaIcon: CtaIcon = Sparkles,
}: ContentPreviewProps) {
    const quickMode = item.quick_mode_json as QuickMode | null;

    // Filter out empty takeaways
    const activeTakeaways = quickMode?.key_takeaways.filter(t => t && t.trim().length > 0) || [];

    return (
        <div className="min-h-screen bg-background text-foreground pb-20 relative overflow-hidden">
            {/* Ambient Background */}
            {item.cover_image_url && (
                <div className="absolute inset-0 z-0">
                    <div className="absolute inset-0 bg-gradient-to-t from-background via-background/95 to-background/80 z-10" />
                    <img
                        src={item.cover_image_url}
                        alt=""
                        className="w-full h-full object-cover blur-[100px] opacity-30 select-none"
                    />
                </div>
            )}

            {/* Header - Transparent & Floating */}
            <div className="relative z-40">
                <div className="max-w-7xl mx-auto px-6 lg:px-16 py-6">
                    <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                        <Link
                            href="/"
                            className="inline-flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors"
                        >
                            <ArrowLeft className="size-5" />
                            <span className="font-medium">Back</span>
                        </Link>

                        {/* Actions - specific to header if any others needed */}
                        <div className="flex items-center gap-4">
                        </div>
                    </div>
                </div>
            </div>

            {/* Main Content */}
            <AnimatePresence mode="wait">
                <motion.div
                    key={item.id}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -10 }}
                    transition={{ duration: 0.3 }}
                    className="relative z-10 max-w-7xl mx-auto px-6 lg:px-16 py-8"
                >
                    <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 lg:gap-16">
                        {/* Left Column: Cover & Sticky Actions */}
                        <div className="lg:col-span-4 space-y-8">
                            {item.cover_image_url && (
                                <motion.div
                                    initial={{ scale: 0.95, opacity: 0 }}
                                    animate={{ scale: 1, opacity: 1 }}
                                    transition={{ delay: 0.1 }}
                                    className="aspect-[2/3] w-full max-w-[320px] mx-auto lg:max-w-none rounded-2xl overflow-hidden shadow-2xl shadow-black/50 border border-white/10 ring-1 ring-white/5 relative group"
                                >
                                    <img
                                        src={item.cover_image_url}
                                        alt={item.title}
                                        className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105"
                                    />
                                    <div className="absolute inset-0 bg-gradient-to-t from-black/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
                                </motion.div>
                            )}

                            {/* Desktop Actions */}
                            <div className="hidden lg:flex flex-col gap-3">
                                <Link
                                    href={`/read/${item.id}`}
                                    className="w-full inline-flex h-14 items-center justify-center gap-3 rounded-xl bg-primary text-primary-foreground text-lg font-semibold hover:bg-primary/90 transition-all hover:scale-[1.02] shadow-xl shadow-primary/20"
                                >
                                    <BookOpen className="size-5" />
                                    Start Reading
                                </Link>

                                {onSpinAgain && (
                                    <button
                                        onClick={onSpinAgain}
                                        disabled={isSpinning}
                                        className="w-full inline-flex h-12 items-center justify-center gap-2 rounded-xl bg-white/5 text-foreground hover:bg-white/10 hover:text-white transition-all border border-white/5 font-medium"
                                    >
                                        <CtaIcon className={`size-4 ${isSpinning ? "animate-spin" : ""}`} />
                                        <span>Discover Another</span>
                                    </button>
                                )}

                                <div className="flex items-center justify-center gap-4 text-sm text-muted-foreground mt-2">
                                    {item.duration_seconds && (
                                        <span className="flex items-center gap-1.5 bg-white/5 px-3 py-1.5 rounded-full border border-white/5">
                                            <Clock className="size-3.5" />
                                            {Math.round(item.duration_seconds / 60)} min
                                        </span>
                                    )}
                                    <span className="flex items-center gap-1.5 bg-white/5 px-3 py-1.5 rounded-full border border-white/5 uppercase tracking-wider font-semibold text-xs">
                                        {item.type}
                                    </span>
                                </div>
                            </div>
                        </div>

                        {/* Right Column: Content Details */}
                        <div className="lg:col-span-8 space-y-10">
                            {/* Header Info */}
                            <div className="space-y-6 text-center lg:text-left">
                                <div className="space-y-2">
                                    <h1 className="text-2xl md:text-3xl lg:text-4xl font-semibold text-foreground tracking-tight leading-[1.1]">
                                        {item.title}
                                    </h1>
                                    {item.author && (
                                        <div className="text-xl md:text-2xl text-muted-foreground font-medium">
                                            {item.author}
                                        </div>
                                    )}
                                </div>

                                {/* Mobile Actions */}
                                <div className="lg:hidden flex flex-col gap-4">
                                    <div className="flex flex-wrap items-center justify-center gap-3 text-sm text-muted-foreground">
                                        <span className="px-3 py-1 rounded-full bg-white/10 border border-white/5 font-medium">
                                            {item.type}
                                        </span>
                                        {item.duration_seconds && (
                                            <span className="flex items-center gap-1 px-3 py-1 rounded-full bg-white/10 border border-white/5">
                                                <Clock className="size-3.5" />
                                                {Math.round(item.duration_seconds / 60)} min
                                            </span>
                                        )}
                                        {segmentCount !== undefined && segmentCount !== null && segmentCount > 0 && (
                                            <span className="px-3 py-1 rounded-full bg-white/10 border border-white/5">
                                                {segmentCount} sections
                                            </span>
                                        )}
                                    </div>
                                    <Link
                                        href={`/read/${item.id}`}
                                        className="w-full inline-flex h-12 items-center justify-center gap-2 rounded-xl bg-primary text-primary-foreground font-bold hover:bg-primary/90 transition-transform active:scale-95"
                                    >
                                        <BookOpen className="size-5" />
                                        Start Reading
                                    </Link>
                                    {onSpinAgain && (
                                        <button
                                            onClick={onSpinAgain}
                                            disabled={isSpinning}
                                            className="w-full inline-flex h-12 items-center justify-center gap-2 rounded-xl bg-white/5 text-foreground hover:bg-white/10 hover:text-white transition-all border border-white/5 font-medium"
                                        >
                                            <CtaIcon className={`size-4 ${isSpinning ? "animate-spin" : ""}`} />
                                            <span>Discover Another</span>
                                        </button>
                                    )}
                                </div>
                            </div>

                            {quickMode ? (
                                <div className="space-y-10 animate-in fade-in slide-in-from-bottom-8 duration-700 delay-200 fill-mode-both">
                                    {/* Hook */}
                                    {quickMode.hook && (
                                        <div className="relative">
                                            <blockquote className="text-lg md:text-xl font-serif italic leading-relaxed text-muted-foreground/80 pl-6 border-l-2 border-primary/30">
                                                &ldquo;{quickMode.hook}&rdquo;
                                            </blockquote>
                                        </div>
                                    )}

                                    {/* Big Idea */}
                                    <div className="bg-zinc-900/40 backdrop-blur-md rounded-3xl p-8 border border-white/10 shadow-2xl">
                                        <h3 className="text-xs font-bold text-primary uppercase tracking-[0.2em] mb-4">
                                            The Big Idea
                                        </h3>
                                        <p className="text-lg md:text-xl text-foreground leading-relaxed font-light">
                                            {quickMode.big_idea}
                                        </p>
                                    </div>

                                    {/* Key Takeaways */}
                                    {activeTakeaways.length > 0 && (
                                        <div className="space-y-6">
                                            <h3 className="text-sm font-bold text-muted-foreground uppercase tracking-[0.2em] px-2">
                                                Key Takeaways
                                            </h3>
                                            <div className="grid gap-4">
                                                {activeTakeaways.map((takeaway, index) => (
                                                    <div
                                                        key={index}
                                                        className="group flex gap-5 p-6 rounded-2xl bg-white/5 hover:bg-white/10 border border-white/5 hover:border-white/10 transition-all duration-300"
                                                    >
                                                        <span className="flex-shrink-0 w-10 h-10 rounded-xl bg-primary/10 text-primary flex items-center justify-center text-lg font-bold group-hover:scale-110 transition-transform">
                                                            {index + 1}
                                                        </span>
                                                        <p className="text-lg text-foreground/90 leading-relaxed">
                                                            {takeaway}
                                                        </p>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    )}
                                </div>
                            ) : (
                                <div className="flex flex-col items-center justify-center h-full min-h-[300px] bg-white/5 rounded-3xl border border-white/5 p-12 text-center text-muted-foreground">
                                    <BookOpen className="size-16 mb-4 opacity-30" />
                                    <p className="text-lg">Preview content coming soon.</p>
                                </div>
                            )}
                        </div>
                    </div>
                </motion.div>
            </AnimatePresence>
        </div >
    );
}
