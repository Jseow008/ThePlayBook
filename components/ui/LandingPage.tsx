"use client";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import Image from "next/image";
import {
    BookOpen,
    Headphones,
    FileText,
    Zap,
    CheckSquare,
    BarChart3,
    Sparkles,
    Library,
    ArrowRight,
    ChevronDown,
    Activity,
    Brain,
    CircleDollarSign,
    Dumbbell,
    Briefcase,
    Lightbulb,
    Heart,
    Microscope,
    Laptop,
    Smile,
    Scale,
    Globe,
    Tag,
    Network,
    Waves,
    LayoutGrid,
} from "lucide-react";
import { APP_NAME } from "@/lib/brand";
import type { ContentItem } from "@/types/database";

// ----- Types -----

interface LandingPageProps {
    previewItems: ContentItem[];
    categories: { category: string; count: number }[];
    totalContentCount: number;
    totalCategoryCount?: number;
}

// ----- Category Icon Map -----

const CATEGORY_ICONS: Record<string, React.ElementType> = {
    Mindset: Brain,
    Health: Activity,
    Wealth: CircleDollarSign,
    Business: Briefcase,
    Philosophy: Lightbulb,
    Fitness: Dumbbell,
    Finance: Scale,
    Productivity: Briefcase,
    Relationships: Heart,
    Science: Microscope,
    Technology: Laptop,
    Lifestyle: Smile,
    Travel: Globe,
};

// ----- Intersection Observer Hook -----

function useInView(options?: IntersectionObserverInit) {
    const ref = useRef<HTMLDivElement>(null);
    const [isVisible, setIsVisible] = useState(false);

    useEffect(() => {
        const el = ref.current;
        if (!el) return;

        const observer = new IntersectionObserver(([entry]) => {
            if (entry.isIntersecting) {
                setIsVisible(true);
                observer.unobserve(el);
            }
        }, { threshold: 0.15, ...options });

        observer.observe(el);
        return () => observer.disconnect();
    }, [options]);

    return { ref, isVisible };
}

// ===================================================================
// MAIN COMPONENT
// ===================================================================

export function LandingPage({ previewItems, categories, totalContentCount, totalCategoryCount }: LandingPageProps) {
    return (
        <>
            {/* Fixed Header */}
            <LandingHeader />

            <main className="min-h-screen bg-background text-foreground">
                {/* Hero */}
                <HeroSection totalContentCount={totalContentCount} totalCategoryCount={totalCategoryCount} />

                {/* Why Netflux? — Brand Story */}
                <WhyNetfluxSection />

                {/* How It Works */}
                <HowItWorksSection />

                {/* Features */}
                <FeaturesSection />

                {/* Content Preview */}
                {previewItems.length > 0 && (
                    <ContentPreviewSection items={previewItems} />
                )}

                {/* Content Types */}
                <ContentTypesSection />

                {/* Categories */}
                {categories.length > 0 && (
                    <CategoriesSection categories={categories} />
                )}

                {/* Final CTA */}
                <FinalCTASection />

                {/* Footer */}
                <LandingFooter />
            </main>
        </>
    );
}

// ===================================================================
// HEADER
// ===================================================================

function LandingHeader() {
    const [scrolled, setScrolled] = useState(false);

    useEffect(() => {
        const handleScroll = () => setScrolled(window.scrollY > 50);
        window.addEventListener("scroll", handleScroll, { passive: true });
        return () => window.removeEventListener("scroll", handleScroll);
    }, []);

    return (
        <header
            className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 ${scrolled
                ? "bg-background/80 backdrop-blur-xl border-b border-white/[0.08] shadow-2xl"
                : "bg-transparent"
                }`}
        >
            <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
                <Link href="/" className="flex items-center gap-2.5">
                    <div className="relative h-7 w-28">
                        <Image
                            src="/images/netflux-logo.png"
                            alt={APP_NAME}
                            fill
                            className="object-contain"
                            priority
                        />
                    </div>
                </Link>

                <div className="flex items-center gap-4">
                    <Link
                        href="/browse"
                        className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors inline-flex"
                    >
                        Browse
                    </Link>
                    <Link
                        href="/login"
                        className="inline-flex items-center px-4 py-2 rounded-full bg-white text-black text-sm font-semibold hover:bg-white/90 transition-all hover:scale-105 active:scale-95"
                    >
                        Sign In
                    </Link>
                </div>
            </div>
        </header>
    );
}

// ===================================================================
// HERO SECTION
// ===================================================================

function HeroSection({ totalContentCount, totalCategoryCount }: { totalContentCount: number; totalCategoryCount?: number }) {
    return (
        <section className="relative min-h-screen flex items-center justify-center overflow-hidden">
            {/* Flow gradient background */}
            <div className="absolute inset-0">
                <div className="absolute inset-0 bg-gradient-to-br from-zinc-950 via-background to-zinc-900" />
                {/* Flowing gradient blobs with CSS animation */}
                <div
                    className="landing-hero-flow-1 absolute top-[-20%] left-[-10%] w-[800px] h-[800px] rounded-full blur-[120px] opacity-60"
                    style={{
                        background: "radial-gradient(circle, rgba(139,92,246,0.12) 0%, rgba(59,130,246,0.06) 50%, transparent 70%)",
                    }}
                />
                <div
                    className="landing-hero-flow-2 absolute bottom-[-20%] right-[-10%] w-[700px] h-[700px] rounded-full blur-[100px] opacity-50"
                    style={{
                        background: "radial-gradient(circle, rgba(59,130,246,0.10) 0%, rgba(16,185,129,0.05) 50%, transparent 70%)",
                    }}
                />
                <div
                    className="landing-hero-flow-3 absolute top-[20%] right-[10%] w-[500px] h-[500px] rounded-full blur-[80px] opacity-40"
                    style={{
                        background: "radial-gradient(circle, rgba(236,72,153,0.08) 0%, rgba(139,92,246,0.04) 50%, transparent 70%)",
                    }}
                />
            </div>

            {/* Grain / Noise texture overlay */}
            <svg className="absolute inset-0 w-full h-full pointer-events-none opacity-[0.035]" aria-hidden="true">
                <filter id="hero-grain">
                    <feTurbulence type="fractalNoise" baseFrequency="0.65" numOctaves="3" stitchTiles="stitch" />
                    <feColorMatrix type="saturate" values="0" />
                </filter>
                <rect width="100%" height="100%" filter="url(#hero-grain)" />
            </svg>

            {/* Subtle grid pattern */}
            <div
                className="absolute inset-0 opacity-[0.025]"
                style={{
                    backgroundImage: "linear-gradient(rgba(255,255,255,0.1) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.1) 1px, transparent 1px)",
                    backgroundSize: "64px 64px",
                }}
            />

            <div className="relative z-10 max-w-4xl mx-auto px-6 text-center pt-20">

                {/* Headline */}
                <h1 className="text-4xl sm:text-5xl md:text-6xl lg:text-7xl font-bold tracking-tight leading-[1.1] mb-6">
                    <span className="text-foreground">The world&apos;s best ideas.</span>
                    <br />
                    <span className="bg-gradient-to-r from-zinc-200 via-zinc-400 to-zinc-300 bg-clip-text text-transparent">
                        Distilled. Actionable. Free.
                    </span>
                </h1>

                {/* Subheadline */}
                <p className="text-lg sm:text-xl text-muted-foreground max-w-2xl mx-auto mb-10 leading-relaxed">
                    Structured summaries of top books, podcasts, and articles — with built-in checklists to turn ideas into action.
                </p>

                {/* CTAs */}
                <div className="flex flex-col sm:flex-row items-center justify-center gap-4 mb-14">
                    <a
                        href="#why-netflux"
                        className="inline-flex items-center gap-2 px-6 py-3.5 rounded-full border border-white/10 text-sm font-medium text-muted-foreground hover:text-foreground hover:border-white/20 transition-all"
                    >
                        Why {APP_NAME}?
                        <ChevronDown className="size-4" />
                    </a>
                    <Link
                        href="/browse"
                        className="inline-flex items-center gap-2 px-8 py-3.5 rounded-full bg-white text-black text-base font-semibold hover:bg-white/90 transition-all hover:scale-105 active:scale-95 shadow-lg shadow-white/10"
                    >
                        Start Exploring
                        <ArrowRight className="size-4" />
                    </Link>
                </div>

                {/* Glassmorphism Stats Bar */}
                <div className="inline-flex flex-wrap items-center justify-center gap-6 sm:gap-8 px-8 py-4 rounded-2xl bg-white/[0.04] border border-white/[0.08] backdrop-blur-xl">
                    <div className="flex items-center gap-2.5">
                        <div className="p-1.5 rounded-lg bg-blue-500/10">
                            <BookOpen className="size-4 text-blue-400" />
                        </div>
                        <div className="text-left">
                            <p className="text-sm font-semibold text-foreground">{totalContentCount}+</p>
                            <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Summaries</p>
                        </div>
                    </div>
                    <div className="w-px h-8 bg-white/[0.08] hidden sm:block" />
                    <div className="flex items-center gap-2.5">
                        <div className="p-1.5 rounded-lg bg-purple-500/10">
                            <LayoutGrid className="size-4 text-purple-400" />
                        </div>
                        <div className="text-left">
                            <p className="text-sm font-semibold text-foreground">{totalCategoryCount || 12}+</p>
                            <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Categories</p>
                        </div>
                    </div>
                </div>
            </div>

            {/* Scroll indicator */}
            <div className="absolute bottom-8 left-1/2 -translate-x-1/2 animate-bounce">
                <ChevronDown className="size-5 text-muted-foreground/50" />
            </div>

        </section>
    );
}

// ===================================================================
// WHY NETFLUX? — BRAND STORY SECTION
// ===================================================================

function WhyNetfluxSection() {
    const { ref, isVisible } = useInView();

    return (
        <section id="why-netflux" ref={ref} className="py-24 sm:py-32 px-6 scroll-mt-16 relative overflow-hidden">
            {/* Subtle gradient accent */}
            <div className="absolute inset-0 bg-gradient-to-b from-transparent via-white/[0.01] to-transparent" />

            <div className="relative max-w-4xl mx-auto">
                {/* Section header */}
                <div className={`text-center mb-16 transition-all duration-700 ${isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-8"}`}>
                    <p className="text-xs font-bold text-primary/60 uppercase tracking-[0.25em] mb-6">
                        The Name
                    </p>
                    <h2 className="text-3xl sm:text-4xl md:text-5xl font-bold tracking-tight">
                        Why <span className="bg-gradient-to-r from-blue-400 via-purple-400 to-blue-400 bg-clip-text text-transparent">{APP_NAME}</span>?
                    </h2>
                </div>

                {/* Two-column etymology cards */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-12">
                    {/* NET card */}
                    <div
                        className={`group relative rounded-2xl border border-white/[0.08] bg-white/[0.03] p-8 backdrop-blur-sm transition-all duration-700 hover:border-blue-500/20 hover:bg-white/[0.05] ${isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-8"}`}
                        style={{ transitionDelay: "150ms" }}
                    >
                        {/* Glow effect on hover */}
                        <div className="absolute inset-0 rounded-2xl bg-gradient-to-br from-blue-500/[0.05] to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
                        <div className="relative">
                            <div className="flex items-center gap-3 mb-5">
                                <div className="p-2.5 rounded-xl bg-blue-500/10 border border-blue-500/10">
                                    <Network className="size-5 text-blue-400" />
                                </div>
                                <span className="text-3xl sm:text-4xl font-bold tracking-tight text-foreground">NET</span>
                            </div>
                            <p className="text-xs font-medium text-blue-400/70 uppercase tracking-[0.2em] mb-3">
                                noun. A network. An interconnected system.
                            </p>
                            <p className="text-base sm:text-[17px] text-muted-foreground leading-relaxed">
                                Your reading doesn&apos;t exist in isolation. Every book connects to a podcast, every article builds on a philosophy. {APP_NAME} captures it all in one unified stream — a network of the world&apos;s best ideas.
                            </p>
                        </div>
                    </div>

                    {/* FLUX card */}
                    <div
                        className={`group relative rounded-2xl border border-white/[0.08] bg-white/[0.03] p-8 backdrop-blur-sm transition-all duration-700 hover:border-purple-500/20 hover:bg-white/[0.05] ${isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-8"}`}
                        style={{ transitionDelay: "300ms" }}
                    >
                        <div className="absolute inset-0 rounded-2xl bg-gradient-to-br from-purple-500/[0.05] to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
                        <div className="relative">
                            <div className="flex items-center gap-3 mb-5">
                                <div className="p-2.5 rounded-xl bg-purple-500/10 border border-purple-500/10">
                                    <Waves className="size-5 text-purple-400" />
                                </div>
                                <span className="text-3xl sm:text-4xl font-bold tracking-tight text-foreground">FLUX</span>
                            </div>
                            <p className="text-xs font-medium text-purple-400/70 uppercase tracking-[0.2em] mb-3">
                                noun. A state of continuous change and flow.
                            </p>
                            <p className="text-base sm:text-[17px] text-muted-foreground leading-relaxed">
                                Inspired by the psychology of Flow — that rare state when learning feels effortless. We designed every interaction to keep knowledge moving: from page, to mind, to action.
                            </p>
                        </div>
                    </div>
                </div>

                {/* Combined meaning */}
                <div
                    className={`text-center transition-all duration-700 ${isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-8"}`}
                    style={{ transitionDelay: "450ms" }}
                >
                    <div className="inline-flex flex-col items-center gap-3 px-8 py-5 rounded-2xl bg-white/[0.03] border border-white/[0.06] backdrop-blur-sm">
                        <p className="text-lg sm:text-xl font-semibold">
                            <span className="text-blue-400">Net</span><span className="text-purple-400">flux</span>
                            <span className="text-muted-foreground font-normal"> — A network of ideas in constant flow.</span>
                        </p>
                        <p className="text-xs text-muted-foreground/70">
                            Not a clone of anything. A new way to consume knowledge.
                        </p>
                    </div>
                </div>
            </div>
        </section>
    );
}

// ===================================================================
// HOW IT WORKS
// ===================================================================

function HowItWorksSection() {
    const { ref, isVisible } = useInView();

    const steps = [
        {
            icon: BookOpen,
            number: "01",
            title: "Choose Your Topic",
            description: "Organized by the problem you want to solve — Health, Wealth, Mindset, and more. No browsing by ISBN.",
            accent: "from-white/[0.08] to-transparent",
        },
        {
            icon: Zap,
            number: "02",
            title: "Skim or Deep-Dive",
            description: "Get the highlights in 2 minutes with Quick Mode, or read the full structured summary with Deep Mode.",
            accent: "from-white/[0.08] to-transparent",
        },
        {
            icon: CheckSquare,
            number: "03",
            title: "Turn Knowledge Into Action",
            description: "Every summary comes with actionable checklists. Don't just read about a morning routine — start tracking it.",
            accent: "from-white/[0.08] to-transparent",
        },
    ];

    return (
        <section id="how-it-works" className="py-24 sm:py-32 px-6 scroll-mt-16">
            <div className="max-w-6xl mx-auto">
                <div
                    ref={ref}
                    className={`text-center mb-16 transition-all duration-700 ${isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-8"}`}
                >
                    <p className="text-xs font-bold text-primary/60 uppercase tracking-[0.25em] mb-4">
                        How It Works
                    </p>
                    <h2 className="text-3xl sm:text-4xl font-bold tracking-tight">
                        Knowledge in three steps
                    </h2>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    {steps.map((step, i) => (
                        <div
                            key={step.number}
                            className={`relative group rounded-2xl border border-white/[0.06] bg-white/[0.02] p-8 transition-all duration-700 hover:border-white/[0.12] hover:bg-white/[0.04] ${isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-8"}`}
                            style={{ transitionDelay: `${i * 150}ms` }}
                        >
                            {/* Gradient glow */}
                            <div className={`absolute inset-0 rounded-2xl bg-gradient-to-b ${step.accent} opacity-0 group-hover:opacity-100 transition-opacity duration-500`} />

                            <div className="relative">
                                <span className="text-sm font-mono text-zinc-400 mb-4 block font-medium">{step.number}</span>
                                <div className="p-3 rounded-xl bg-white/[0.05] w-fit mb-5">
                                    <step.icon className="size-6 text-foreground" />
                                </div>
                                <h3 className="text-lg font-semibold mb-3">{step.title}</h3>
                                <p className="text-base text-muted-foreground leading-relaxed">{step.description}</p>
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        </section>
    );
}

// ===================================================================
// FEATURES SECTION
// ===================================================================

function FeaturesSection() {
    const { ref, isVisible } = useInView();

    const features = [
        {
            icon: Headphones,
            title: "Audio Summaries",
            description: "Listen on the go. Every summary has an audio version.",
        },
        {
            icon: BarChart3,
            title: "Reading Heatmap & Stats",
            description: "Track your reading habits with GitHub-style heatmaps and streaks.",
        },
        {
            icon: Sparkles,
            title: "Smart Recommendations",
            description: "\"Because you read X\" — AI-powered suggestions based on your history.",
        },
        {
            icon: Library,
            title: "Personal Library",
            description: "My List, In Progress, Completed — organize your knowledge journey.",
        },
    ];

    return (
        <section className="py-24 sm:py-32 px-6 bg-white/[0.01]">
            <div className="max-w-6xl mx-auto">
                <div
                    ref={ref}
                    className={`text-center mb-16 transition-all duration-700 ${isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-8"}`}
                >
                    <p className="text-xs font-bold text-primary/60 uppercase tracking-[0.25em] mb-4">
                        The Experience
                    </p>
                    <h2 className="text-3xl sm:text-4xl font-bold tracking-tight mb-4">
                        More than just summaries
                    </h2>
                    <p className="text-muted-foreground text-base max-w-lg mx-auto">
                        A complete system for consuming, tracking, and acting on knowledge.
                    </p>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                    {features.map((feature, i) => (
                        <div
                            key={feature.title}
                            className={`group flex gap-5 p-6 rounded-xl border border-white/[0.06] bg-white/[0.02] hover:bg-white/[0.04] hover:border-white/[0.10] transition-all duration-700 ${isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-8"}`}
                            style={{ transitionDelay: `${i * 100}ms` }}
                        >
                            <div className="p-3 rounded-lg bg-white/[0.05] h-fit group-hover:bg-white/[0.08] transition-colors">
                                <feature.icon className="size-5 text-foreground" />
                            </div>
                            <div>
                                <h3 className="text-base font-semibold mb-1.5">{feature.title}</h3>
                                <p className="text-base text-muted-foreground leading-relaxed">{feature.description}</p>
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        </section>
    );
}

// ===================================================================
// CONTENT PREVIEW
// ===================================================================

function ContentPreviewSection({ items }: { items: ContentItem[] }) {
    const { ref, isVisible } = useInView();

    return (
        <section className="py-24 sm:py-32 px-6">
            <div className="max-w-6xl mx-auto">
                <div
                    ref={ref}
                    className={`text-center mb-12 transition-all duration-700 ${isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-8"}`}
                >
                    <p className="text-xs font-bold text-primary/60 uppercase tracking-[0.25em] mb-4">
                        Real Content
                    </p>
                    <h2 className="text-3xl sm:text-4xl font-bold tracking-tight mb-4">
                        Dive in — it&apos;s all free
                    </h2>
                    <p className="text-muted-foreground text-base max-w-lg mx-auto">
                        No paywall. No trial. Just curated knowledge, ready to explore.
                    </p>
                </div>

                <div className="relative overflow-hidden -mx-6 px-6 sm:-mx-0 sm:px-0 pb-8 group">
                    <div className={`landing-carousel-track flex w-max gap-4 transition-all duration-700 ${isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-8"}`} style={{ transitionDelay: "200ms" }}>
                        {[...items, ...items, ...items, ...items].slice(0, Math.max(12, items.length * 2)).map((item, index) => (
                            <Link
                                key={`${item.id}-${index}`}
                                href={`/read/${item.id}`}
                                className="relative flex-none w-[60vw] sm:w-[35vw] md:w-[28vw] lg:w-[15vw] xl:w-[14vw] aspect-[2/3] rounded-xl overflow-hidden border border-white/[0.06] bg-card hover:border-white/[0.15] transition-all duration-300 hover:-translate-y-1 block"
                                style={{ perspective: "600px" }}
                            >
                                {item.cover_image_url ? (
                                    <Image
                                        src={item.cover_image_url}
                                        alt={item.title}
                                        fill
                                        className="object-cover transition-transform duration-500 hover:scale-105 hover:[transform:rotateY(2deg)]"
                                        sizes="(max-width: 640px) 50vw, (max-width: 768px) 33vw, 16vw"
                                    />
                                ) : (
                                    <div className="absolute inset-0 bg-gradient-to-br from-zinc-800 to-zinc-900" />
                                )}
                                {/* Overlay */}
                                <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent pointer-events-none" />
                                {/* Content */}
                                <div className="absolute bottom-0 left-0 right-0 p-3 pointer-events-none">
                                    <span className="text-[10px] uppercase tracking-wider text-zinc-400 font-medium">
                                        {item.type}
                                    </span>
                                    <h3 className="text-xs sm:text-sm font-semibold text-white line-clamp-2 leading-tight mt-0.5">
                                        {item.title}
                                    </h3>
                                </div>
                            </Link>
                        ))}
                    </div>
                </div>

                <div className={`text-center mt-10 transition-all duration-700 ${isVisible ? "opacity-100" : "opacity-0"}`} style={{ transitionDelay: "400ms" }}>
                    <Link
                        href="/browse"
                        className="inline-flex items-center gap-2 px-6 py-3 rounded-full border border-white/10 text-sm font-medium text-muted-foreground hover:text-foreground hover:border-white/20 transition-all hover:scale-105"
                    >
                        Browse All Content
                        <ArrowRight className="size-4" />
                    </Link>
                </div>
            </div>
        </section>
    );
}

// ===================================================================
// CONTENT TYPES
// ===================================================================

function ContentTypesSection() {
    const { ref, isVisible } = useInView();

    const types = [
        {
            icon: BookOpen,
            title: "Books",
            description: "Chapter-by-chapter breakdowns with key takeaways and actionable insights.",
            accent: "from-blue-500/10 to-transparent",
            iconColor: "text-blue-400",
        },
        {
            icon: Headphones,
            title: "Podcasts",
            description: "Episode summaries and key insights from the world's top shows.",
            accent: "from-purple-500/10 to-transparent",
            iconColor: "text-purple-400",
        },
        {
            icon: FileText,
            title: "Articles",
            description: "Condensed versions of long-form pieces — the signal without the noise.",
            accent: "from-emerald-500/10 to-transparent",
            iconColor: "text-emerald-400",
        },
    ];

    return (
        <section className="py-24 sm:py-32 px-6 bg-white/[0.01]">
            <div className="max-w-5xl mx-auto">
                <div
                    ref={ref}
                    className={`text-center mb-14 transition-all duration-700 ${isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-8"}`}
                >
                    <p className="text-xs font-bold text-primary/60 uppercase tracking-[0.25em] mb-4">
                        What We Cover
                    </p>
                    <h2 className="text-3xl sm:text-4xl font-bold tracking-tight">
                        Three formats. One stream.
                    </h2>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    {types.map((type, i) => (
                        <div
                            key={type.title}
                            className={`relative rounded-2xl border border-white/[0.06] bg-white/[0.02] p-8 text-center transition-all duration-700 hover:border-white/[0.12] ${isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-8"}`}
                            style={{ transitionDelay: `${i * 150}ms` }}
                        >
                            <div className={`absolute inset-0 rounded-2xl bg-gradient-to-b ${type.accent} opacity-50`} />
                            <div className="relative">
                                <div className="p-4 rounded-xl bg-white/[0.05] w-fit mx-auto mb-5">
                                    <type.icon className={`size-7 ${type.iconColor}`} />
                                </div>
                                <h3 className="text-lg font-semibold mb-2">{type.title}</h3>
                                <p className="text-sm text-muted-foreground leading-relaxed">{type.description}</p>
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        </section>
    );
}

// ===================================================================
// CATEGORIES
// ===================================================================

function CategoriesSection({ categories }: { categories: { category: string; count: number }[] }) {
    const { ref, isVisible } = useInView();

    return (
        <section className="py-24 sm:py-32 px-6">
            <div className="max-w-5xl mx-auto">
                <div
                    ref={ref}
                    className={`text-center mb-12 transition-all duration-700 ${isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-8"}`}
                >
                    <p className="text-xs font-bold text-primary/60 uppercase tracking-[0.25em] mb-4">
                        Browse By Life Area
                    </p>
                    <h2 className="text-3xl sm:text-4xl font-bold tracking-tight mb-4">
                        Organized by the problem you want to solve
                    </h2>
                    <p className="text-muted-foreground text-base max-w-lg mx-auto">
                        Not by book title. Not by author. By what matters to you.
                    </p>
                </div>

                <div className={`grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3 transition-all duration-700 ${isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-8"}`} style={{ transitionDelay: "200ms" }}>
                    {categories.map((cat) => {
                        const Icon = CATEGORY_ICONS[cat.category] || Tag;
                        return (
                            <Link
                                key={cat.category}
                                href={`/search?category=${encodeURIComponent(cat.category)}`}
                                className="group flex items-center gap-3 p-4 rounded-xl border border-white/[0.06] bg-white/[0.02] hover:bg-white/[0.05] hover:border-white/[0.12] transition-all"
                            >
                                <div className="p-2 rounded-lg bg-white/[0.05] group-hover:bg-white/[0.08] transition-colors">
                                    <Icon className="size-4 text-zinc-300 group-hover:text-white transition-colors" />
                                </div>
                                <div className="flex-1 min-w-0">
                                    <span className="text-sm font-medium text-zinc-200 group-hover:text-white transition-colors">
                                        {cat.category}
                                    </span>
                                </div>
                                <span className="text-xs text-zinc-500 font-medium">{cat.count}</span>
                            </Link>
                        );
                    })}
                </div>
            </div>
        </section>
    );
}

// ===================================================================
// FINAL CTA
// ===================================================================

function FinalCTASection() {
    const { ref, isVisible } = useInView();

    return (
        <section className="relative min-h-[60vh] flex flex-col items-center justify-center py-24 px-6 overflow-hidden bg-gradient-to-b from-background to-zinc-950/50">
            {/* Ambient background glow for visual interest */}
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                <div className="w-[800px] h-[400px] bg-blue-500/5 rounded-full blur-[120px]" />
            </div>

            <div
                ref={ref}
                className={`relative z-10 max-w-3xl mx-auto text-center transition-all duration-700 ${isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-8"}`}
            >
                <h2 className="text-3xl sm:text-4xl md:text-5xl font-bold tracking-tight mb-6">
                    Stop reading about reading.
                    <br />
                    <span className="bg-gradient-to-r from-zinc-300 to-zinc-500 bg-clip-text text-transparent">
                        Start reading what matters.
                    </span>
                </h2>

                <p className="text-muted-foreground text-base sm:text-lg mb-10 max-w-xl mx-auto">
                    All content is free. Create an account to track your progress, build your library, and get personalized recommendations.
                </p>

                <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
                    <Link
                        href="/browse"
                        className="inline-flex items-center gap-2 px-8 py-3.5 rounded-full bg-white text-black text-base font-semibold hover:bg-white/90 transition-all hover:scale-105 active:scale-95 shadow-lg shadow-white/10"
                    >
                        Explore the Library
                        <ArrowRight className="size-4" />
                    </Link>
                    <Link
                        href="/login"
                        className="inline-flex items-center gap-2 px-6 py-3.5 rounded-full border border-white/10 text-sm font-medium text-muted-foreground hover:text-foreground hover:border-white/20 transition-all"
                    >
                        Create Free Account
                    </Link>
                </div>
            </div>
        </section>
    );
}

// ===================================================================
// FOOTER
// ===================================================================

function LandingFooter() {
    return (
        <footer className="py-12 px-6">
            <div className="max-w-6xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-6">
                <div className="flex items-center gap-2">
                    <BookOpen className="size-4 text-muted-foreground" />
                    <span className="text-sm text-muted-foreground">
                        {APP_NAME} — Curated Knowledge Stream
                    </span>
                </div>

                <div className="flex items-center gap-6 text-sm text-muted-foreground">
                    <Link href="/about" className="hover:text-foreground transition-colors">About</Link>
                    <Link href="/privacy" className="hover:text-foreground transition-colors">Privacy</Link>
                    <Link href="/terms" className="hover:text-foreground transition-colors">Terms</Link>
                </div>
            </div>
        </footer>
    );
}
