"use client";

import { useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import Image from "next/image";
import Link from "next/link";
import {
  Activity,
  ArrowRight,
  BookMarked,
  BookOpen,
  Brain,
  Briefcase,
  CircleDollarSign,
  Dumbbell,
  Globe,
  Heart,
  Laptop,
  Lightbulb,
  Microscope,
  NotebookPen,
  RotateCcw,
  Scale,
  Search,
  Smile,
  Sparkles,
} from "lucide-react";
import { Logo } from "@/components/ui/Logo";
import { ContentCard } from "@/components/ui/ContentCard";
import { APP_NAME } from "@/lib/brand";
import { cn } from "@/lib/utils";
import type { ContentItem } from "@/types/database";

/* ==========================================================================
   Types & Props
   ========================================================================== */

interface LandingPageProps {
  featuredItems: ContentItem[];
  categories: { category: string; count: number }[];
  totalContentCount: number;
  totalCategoryCount?: number;
}

/* ==========================================================================
   Constants
   ========================================================================== */

const CATEGORY_ICONS = {
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
} as const;

const CURATED_CATEGORY_ORDER = [
  "Mindset",
  "Health",
  "Wealth",
  "Productivity",
  "Philosophy",
  "Business",
  "Science",
  "Relationships",
  "Technology",
  "Lifestyle",
] as const;

const PROOF_POINTS = [
  "Curated summaries",
  "Structured reading",
  "Highlights and notes",
  "Return anytime",
] as const;

const CORE_ANCHOR_FEATURE = {
  icon: RotateCcw,
  title: "Reading view",
  description: "Read in clear, structured sections designed for focus.",
  image: "/images/Reading Experience Section Reader View.png"
} as const;

const CORE_SUPPORT_FEATURES = [
  {
    icon: BookMarked,
    title: "Preview before you commit",
    description: "See the main idea and understand the thesis before you dive in.",
    image: "/images/Reading Experience Section Info View.png"
  },
  {
    icon: NotebookPen,
    title: "Highlight and annotate",
    description: "Capture the passages worth remembering while you read.",
    image: "/images/Highlighting & Annotation.png"
  },
  {
    icon: Sparkles,
    title: "Ask the author",
    description: "Ask the author(s) questions about what you just read.",
    image: "/images/AI Chat .png"
  },
] as const;

const WORKFLOW_STEPS = [
  {
    number: "01",
    title: "Discover",
    description: "Find high-signal ideas across books, podcasts, and articles.",
    icon: Search,
  },
  {
    number: "02",
    title: "Read",
    description: "Get the core thesis, key takeaways, and structured depth without the noise.",
    icon: BookOpen,
  },
  {
    number: "03",
    title: "Save",
    description: "Keep highlights, notes, and reading progress in one place.",
    icon: BookMarked,
  },
  {
    number: "04",
    title: "Return",
    description: "Revisit what matters when you need clarity, context, or action.",
    icon: RotateCcw,
  },
] as const;

/* ==========================================================================
   Shared Primitives
   ========================================================================== */

/** Simple one-shot reveal from IntersectionObserver (no framer scroll tracking). */
function useInView(threshold = 0.18) {
  const ref = useRef<HTMLDivElement>(null);
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    const element = ref.current;
    if (!element) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setIsVisible(true);
          observer.unobserve(element);
        }
      },
      { threshold }
    );

    observer.observe(element);
    return () => observer.disconnect();
  }, [threshold]);

  return { ref, isVisible };
}

/** Reusable fade-up reveal wrapper. Uses `whileInView` with `once: true` — fires once, no scroll tracking. */
function Reveal({
  children,
  className,
  delay = 0,
}: {
  children: React.ReactNode;
  className?: string;
  delay?: number;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 24 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-80px" }}
      transition={{ duration: 0.6, delay, ease: [0.16, 1, 0.3, 1] }}
      className={className}
    >
      {children}
    </motion.div>
  );
}

/** Section header block used across multiple sections. */
function SectionIntro({
  label,
  title,
  body,
  centered = false,
}: {
  label: string;
  title: string;
  body?: string;
  centered?: boolean;
}) {
  return (
    <div className={cn("max-w-3xl", centered && "mx-auto text-center")}>
      <p className="mb-4 text-xs font-semibold uppercase tracking-[0.3em] text-white/50">
        {label}
      </p>
      <h2 className="font-serif text-4xl font-bold tracking-tight text-white sm:text-5xl md:text-6xl">
        {title}
      </h2>
      {body ? (
        <p className="mt-6 text-base leading-relaxed text-zinc-400 sm:text-xl">{body}</p>
      ) : null}
    </div>
  );
}

/* ==========================================================================
   Page Root
   ========================================================================== */

export function LandingPage({
  featuredItems,
  categories,
}: LandingPageProps) {
  const heroItem = featuredItems[0] ?? null;
  const curatedCategories = getCuratedCategories(categories);

  return (
    <>
      <LandingHeader />

      <main className="relative min-h-screen overflow-x-hidden bg-background text-foreground">
        {/* Subtle global texture — cheap radial, no blur */}
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(221,197,160,0.08),transparent_24%),radial-gradient(circle_at_82%_18%,rgba(91,109,140,0.10),transparent_24%)]" />

        <HeroSection />

        {featuredItems.length > 0 ? <FeaturedReadsSection items={featuredItems} /> : null}

        <ProblemSolutionSection />
        <HowItWorksSection />
        <CorePlatformFeaturesSection />

        {curatedCategories.length > 0 ? <TopicMapSection categories={curatedCategories} /> : null}

        <FinalCTASection />
        <LandingFooter />
      </main>
    </>
  );
}

/* ==========================================================================
   Helpers
   ========================================================================== */

function getCuratedCategories(categories: { category: string; count: number }[]) {
  const categoryMap = new Map(categories.map((item) => [item.category, item]));
  return CURATED_CATEGORY_ORDER.map((name) => categoryMap.get(name)).filter(
    (item): item is { category: string; count: number } => Boolean(item)
  );
}

/* ==========================================================================
   Sticky Header — Fixed nav with backdrop blur on scroll
   ========================================================================== */

function LandingHeader() {
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const handleScroll = () => setScrolled(window.scrollY > 24);
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  return (
    <header
      className={cn(
        "fixed inset-x-0 top-0 z-50 transition-all duration-300",
        scrolled
          ? "border-b border-white/[0.08] bg-background/82 shadow-2xl backdrop-blur-xl"
          : "bg-transparent"
      )}
    >
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-6">
        <Link href="/" className="inline-flex items-center gap-2">
          <Logo width={88} height={24} />
        </Link>

        <div className="flex items-center gap-4">
          <Link
            href="/browse"
            className="hidden text-sm font-medium text-muted-foreground transition-colors hover:text-foreground sm:inline-flex"
          >
            Browse
          </Link>
          <Link
            href="/login"
            className="inline-flex items-center rounded-full border border-white/[0.08] px-4 py-2 text-sm font-semibold text-foreground transition-all hover:bg-white/[0.04]"
          >
            Sign In
          </Link>
        </div>
      </div>
    </header>
  );
}

/* ==========================================================================
   Hero Section — Clean entrance, no scroll-driven motion
   ========================================================================== */

function HeroSection() {
  return (
    <section className="relative flex min-h-[90vh] flex-col justify-center overflow-hidden pb-24 pt-28 sm:pt-32">
      {/* Ambient glow — moderate blur, static */}
      <div className="pointer-events-none absolute inset-0 z-0 opacity-60">
        <div className="absolute left-1/4 top-1/4 h-[320px] w-[320px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-blue-500/10 blur-[80px]" />
        <div className="absolute bottom-1/4 right-1/4 h-[400px] w-[400px] translate-x-1/4 translate-y-1/4 rounded-full bg-emerald-500/5 blur-[80px]" />
      </div>

      <div className="relative z-10 mx-auto grid max-w-7xl gap-16 px-6 lg:px-8 lg:grid-cols-[1fr_1fr] lg:items-center">
        {/* Left: Copy */}
        <div className="max-w-2xl">
          <motion.p
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, ease: "easeOut" }}
            className="mb-8 text-xs font-semibold uppercase tracking-[0.3em] text-white/50"
          >
            Curated knowledge platform
          </motion.p>

          <motion.h1
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.08, ease: "easeOut" }}
            className="font-serif text-5xl font-bold leading-[1.05] tracking-tight text-white sm:text-7xl lg:text-[5.5rem]"
          >
            The world&apos;s best ideas, distilled.
          </motion.h1>

          <motion.p
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.16, ease: "easeOut" }}
            className="mt-8 max-w-xl text-lg leading-relaxed text-zinc-400 sm:text-xl"
          >
            {APP_NAME} transforms books, podcasts, and articles into structured,
            actionable knowledge you can actually retain and use.
          </motion.p>

          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.24, ease: "easeOut" }}
            className="mt-10"
          >
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
              <Link
                href="/login"
                className="group relative inline-flex items-center justify-center gap-3 overflow-hidden rounded-full bg-white px-8 py-4 text-base font-semibold text-black transition-transform hover:scale-[1.02] hover:shadow-[0_0_40px_-10px_rgba(255,255,255,0.4)]"
              >
                <span className="relative z-10">Start Reading</span>
                <ArrowRight className="relative z-10 size-4 transition-transform group-hover:translate-x-1" />
                <div className="absolute inset-0 z-0 bg-gradient-to-r from-white via-zinc-200 to-white opacity-0 transition-opacity group-hover:opacity-100" />
              </Link>
              <Link
                href="/browse"
                className="inline-flex items-center justify-center rounded-full border border-white/10 px-8 py-4 text-base font-medium text-white/70 transition-colors hover:border-white/30 hover:bg-white/5 hover:text-white"
              >
                Browse the Library
              </Link>
            </div>

            {/* Proof strip grouped with CTAs */}
            <div className="mt-6 flex flex-wrap items-center gap-x-6 gap-y-3 text-sm font-medium text-zinc-500">
              {PROOF_POINTS.map((point) => (
                <span key={point} className="inline-flex items-center gap-2">
                  <span className="size-1.5 rounded-full bg-white/20" />
                  {point}
                </span>
              ))}
            </div>
          </motion.div>
        </div>

        {/* Right: Product screenshot — static entrance, no scroll parallax */}
        {/* Right: Product screenshot — contained within grid column */}
        <div className="relative hidden lg:block">
          <motion.div
            initial={{ opacity: 0, scale: 0.96 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.8, delay: 0.15, ease: [0.16, 1, 0.3, 1] }}
            className="relative z-20 w-full"
          >
            {/* Main Desktop Shot (Landscape) */}
            <div className="relative aspect-[2790/1792] w-full overflow-hidden rounded-2xl border border-white/10 bg-black shadow-[0_30px_80px_-20px_rgba(0,0,0,0.7),0_0_30px_rgba(255,255,255,0.04)]">
              <Image
                src="/images/Hero Section.png"
                alt="Flux dashboard desktop experience"
                fill
                priority
                sizes="(max-width: 1024px) 0px, 700px"
                className="object-cover opacity-90"
              />
              <div className="pointer-events-none absolute inset-0 rounded-2xl ring-1 ring-inset ring-white/10" />
            </div>

            {/* Mobile Overlay (Portrait) — tucked neatly inside composition */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.8, delay: 0.4, ease: [0.16, 1, 0.3, 1] }}
              className="absolute -bottom-8 -left-6 z-30 aspect-[1206/2306] w-[140px] overflow-hidden rounded-[1.25rem] border-[4px] border-[#1c1c1e] bg-black shadow-[0_20px_50px_-10px_rgba(0,0,0,0.8),0_0_20px_rgba(0,0,0,0.4)]"
            >
              <Image
                src="/images/Mobile Reader View.png"
                alt="Flux mobile reader experience"
                fill
                priority
                sizes="140px"
                className="object-cover"
              />
              {/* iPhone style top notch visual indicator */}
              <div className="absolute top-0 left-1/2 h-3 w-14 -translate-x-1/2 rounded-b-lg bg-[#1c1c1e]" />
            </motion.div>
          </motion.div>
        </div>
      </div>
    </section>
  );
}

/* ==========================================================================
   Featured Reads — CSS scroll animation, no framer-motion per card
   ========================================================================== */

function FeaturedReadsSection({ items }: { items: ContentItem[] }) {
  const { ref, isVisible } = useInView(0.1);

  if (items.length === 0) return null;

  // Duplicate items for seamless CSS loop. Keep multiplier low.
  const multiplier = Math.max(2, Math.ceil(16 / Math.max(1, items.length)));
  const displayItems = Array.from({ length: multiplier }).flatMap(() => items);

  return (
    <section id="featured-reads" className="scroll-mt-20 overflow-hidden bg-black/50 py-24 sm:py-32">
      <Reveal className="mx-auto mb-16 max-w-7xl px-6">
        <SectionIntro
          label="Start here"
          title="A few ideas worth your attention right now."
          body="A curated selection of high-signal reads to help you think better, work better, and live with more intention."
        />
      </Reveal>

      <div
        ref={ref}
        className={cn(
          "relative mx-auto flex w-full max-w-7xl overflow-hidden pb-8 py-4",
          "transition-all duration-700",
          isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-8"
        )}
      >
        <div className="landing-carousel-track flex w-max items-center gap-4 px-4 sm:gap-6 sm:px-6">
          {displayItems.map((item, index) => (
            <div
              key={`${item.id}-${index}`}
              className="relative w-[160px] flex-none shrink-0 sm:w-[200px] md:w-[240px]"
            >
              <ContentCard item={item} />
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ==========================================================================
   Problem / Solution
   ========================================================================== */

function ProblemSolutionSection() {
  return (
    <section className="relative overflow-hidden py-24 sm:py-32">
      <div className="relative z-10 mx-auto grid max-w-7xl gap-8 px-6 lg:px-8 md:grid-cols-2 md:gap-12">
        <Reveal>
          <div className="rounded-[32px] border border-white/10 bg-gradient-to-br from-white/5 to-white/[0.01] p-10 sm:p-12">
            <p className="text-sm font-semibold uppercase tracking-[0.3em] text-white/50">
              Why {APP_NAME}
            </p>
            <h2 className="mt-8 font-serif text-4xl font-bold tracking-tight text-white text-balance sm:text-5xl lg:text-6xl">
              Most people consume more than they remember.
            </h2>
            <p className="mt-6 text-lg leading-relaxed text-zinc-400">
              Podcasts, books, and articles can be full of value, but most of it disappears as quickly as it arrives.
              The problem is rarely access. It&apos;s retention.
            </p>
          </div>
        </Reveal>

        <Reveal delay={0.15}>
          <div className="relative overflow-hidden rounded-[32px] border border-white/10 bg-black p-10 shadow-2xl sm:p-12">
            <div className="pointer-events-none absolute right-0 top-0 h-48 w-48 rounded-full bg-emerald-500/8 blur-[60px]" />

            <div className="relative z-10">
              <p className="text-sm font-semibold uppercase tracking-[0.3em] text-white/50">
                The answer
              </p>
              <h2 className="mt-8 font-serif text-4xl font-bold tracking-tight text-white text-balance sm:text-5xl lg:text-6xl">
                {APP_NAME} turns information into something you can keep.
              </h2>
              <p className="mt-6 text-lg leading-relaxed text-zinc-400">
                Each piece is distilled into a clear reading experience built for understanding, recall, and reuse, so the
                best ideas stay available when they matter.
              </p>
            </div>
          </div>
        </Reveal>
      </div>
    </section>
  );
}

/* ==========================================================================
   How It Works — Simple staggered reveal, NO scroll-driven transforms
   ========================================================================== */

function HowItWorksSection() {
  return (
    <section className="bg-black py-24 sm:py-32">
      <div className="mx-auto max-w-7xl px-6 lg:px-8">
        <Reveal>
          <SectionIntro
            label="How it works"
            title="A better loop for learning from what you consume."
            body={`${APP_NAME} is designed to move ideas from discovery to understanding to long-term usefulness.`}
          />
        </Reveal>

        <div className="mt-16 grid gap-8 sm:grid-cols-2 lg:grid-cols-4">
          {WORKFLOW_STEPS.map((step, i) => (
            <Reveal key={step.number} delay={i * 0.1}>
              <div className="group flex h-full flex-col gap-6 rounded-3xl border border-white/10 bg-white/[0.03] p-8 transition-colors hover:bg-white/[0.06]">
                <div className="flex items-center justify-between">
                  <span className="font-mono text-sm font-medium text-zinc-500">{step.number}</span>
                  <div className="flex size-12 shrink-0 items-center justify-center rounded-xl border border-white/10 bg-white/5 transition-colors group-hover:bg-white/10">
                    <step.icon className="size-5 text-white" />
                  </div>
                </div>
                <div>
                  <h3 className="text-xl font-semibold text-white">{step.title}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-zinc-400">{step.description}</p>
                </div>
              </div>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ==========================================================================
   Combined Core Platform Features
   ========================================================================== */

function CorePlatformFeaturesSection() {
  return (
    <section className="bg-black py-24 sm:py-32">
      <Reveal>
        <div className="relative mx-auto max-w-7xl overflow-hidden rounded-[3rem] border border-white/10 bg-gradient-to-br from-white/5 to-white/[0.01] px-6 lg:px-8 p-10 sm:p-14 lg:p-16">
          <div className="pointer-events-none absolute inset-0 rounded-[3rem] bg-emerald-500/5 blur-[60px]" />
          <div className="relative z-10 grid gap-16 lg:grid-cols-[0.88fr_1.12fr] lg:items-center">

            {/* Left: Introduction */}
            <div className="max-w-md">
              <SectionIntro
                label="Reading, upgraded"
                title="Built for understanding, not just browsing."
                body={`${APP_NAME} helps you build a personal layer around the ideas you consume. Discover the core idea quickly, and make what you read more useful over time.`}
              />
            </div>

            {/* Right: The Asymmetrical Bento layout */}
            <div className="grid gap-6 sm:grid-cols-2 lg:items-stretch">

              {/* Left Sub-column (The Anchor) */}
              <Reveal delay={0.1}>
                <div className="group relative overflow-hidden flex flex-col h-full rounded-[2rem] border border-white/10 bg-black/80 transition-all hover:bg-zinc-900/90 hover:shadow-2xl hover:border-white/20">
                  {/* Anchor Image Section - large natural dimension */}
                  <div className="relative aspect-[1996/1794] w-full shrink-0 border-b border-white/5 bg-zinc-950 overflow-hidden">
                    <Image
                      src={CORE_ANCHOR_FEATURE.image}
                      alt={`Screenshot illustrating ${CORE_ANCHOR_FEATURE.title}`}
                      fill
                      sizes="(max-width: 640px) 100vw, 50vw"
                      className="object-cover object-top opacity-90 transition-transform duration-300 group-hover:scale-105 group-hover:opacity-100"
                    />
                    <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/50 via-transparent to-transparent" />
                  </div>

                  {/* Anchor Text Section */}
                  <div className="flex flex-col flex-1 p-8 pt-6">
                    <h3 className="text-2xl font-semibold text-white tracking-tight">{CORE_ANCHOR_FEATURE.title}</h3>
                    <p className="mt-3 text-base leading-relaxed text-zinc-400">{CORE_ANCHOR_FEATURE.description}</p>
                  </div>
                </div>
              </Reveal>

              {/* Right Sub-column (The Support Stack) */}
              <div className="flex flex-col gap-6">
                {CORE_SUPPORT_FEATURES.map((feature, i) => (
                  <Reveal key={feature.title} delay={0.15 + i * 0.08}>
                    <div className="group relative overflow-hidden flex flex-row items-center p-3 gap-5 rounded-[2rem] border border-white/10 bg-black/80 transition-all hover:bg-zinc-900/90 hover:shadow-xl hover:border-white/20">
                      {/* Compact Image Thumbnail (Left) */}
                      <div className="relative w-24 h-24 shrink-0 rounded-2xl border border-white/5 bg-zinc-950 overflow-hidden">
                        <Image
                          src={feature.image}
                          alt={`Screenshot illustrating ${feature.title}`}
                          fill
                          sizes="96px"
                          className="object-cover object-top opacity-80 transition-transform duration-300 group-hover:scale-[1.05] group-hover:opacity-100"
                        />
                        <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/60 to-transparent" />

                        <div className="absolute bottom-2 left-2 flex w-6 h-6 items-center justify-center rounded-lg border border-white/10 bg-black/50 backdrop-blur-md">
                          <feature.icon className="w-3 h-3 text-zinc-300" />
                        </div>
                      </div>

                      {/* Compact Text Section (Right) */}
                      <div className="flex flex-col flex-1 pr-4 py-2">
                        <h3 className="text-[15px] font-semibold text-white tracking-tight leading-snug">{feature.title}</h3>
                        <p className="mt-1 text-sm leading-relaxed text-zinc-400">{feature.description}</p>
                      </div>
                    </div>
                  </Reveal>
                ))}
              </div>
            </div>
          </div>
        </div>
      </Reveal>
    </section>
  );
}

/* ==========================================================================
   Knowledge Layer
   ========================================================================== */

/* ==========================================================================
   Topic Map
   ========================================================================== */

function TopicMapSection({ categories }: { categories: { category: string; count: number }[] }) {
  return (
    <section className="py-24 sm:py-32">
      <div className="mx-auto max-w-7xl px-6 lg:px-8">
        <Reveal>
          <SectionIntro
            label="Explore by domain"
            title="Browse the ideas shaping how people think, work, and live."
            body="Move through the library by theme. Start with what matters most to you."
            centered
          />
        </Reveal>

        <div className="mt-16 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
          {categories.map((item, i) => {
            const Icon = CATEGORY_ICONS[item.category as keyof typeof CATEGORY_ICONS] || Sparkles;

            return (
              <Reveal key={item.category} delay={i * 0.04}>
                <Link
                  href={`/search?category=${encodeURIComponent(item.category)}`}
                  className="group flex h-full flex-col items-center justify-center gap-4 rounded-[2rem] border border-white/5 bg-white/5 p-8 text-center transition-all duration-300 hover:-translate-y-1 hover:border-white/20 hover:bg-white/10 hover:shadow-2xl"
                >
                  <div className="rounded-2xl bg-black/40 p-4 shadow-inner transition-colors group-hover:bg-black/60">
                    <Icon className="size-6 text-zinc-400 transition-colors group-hover:text-white" />
                  </div>
                  <span className="text-sm font-semibold tracking-wide text-zinc-300 transition-colors group-hover:text-white">
                    {item.category}
                  </span>
                </Link>
              </Reveal>
            );
          })}
        </div>
      </div>
    </section>
  );
}

/* ==========================================================================
   Final CTA
   ========================================================================== */

function FinalCTASection() {
  return (
    <section className="relative overflow-hidden py-32 sm:py-40">
      <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
        <div className="h-[300px] w-[600px] rounded-full bg-blue-500/8 blur-[80px]" />
      </div>

      <Reveal>
        <div className="relative z-10 mx-auto max-w-4xl px-6 lg:px-8 text-center">
          <h2 className="font-serif text-5xl font-bold tracking-tight text-white sm:text-6xl md:text-7xl">
            Build a library of ideas worth keeping.
          </h2>

          <p className="mx-auto mt-8 max-w-2xl text-lg leading-relaxed text-zinc-400 sm:text-xl">
            Start with a few great reads, then turn them into something you can return to, apply, and build on over time.
          </p>

          <div className="mt-12 flex flex-col items-center justify-center gap-5 sm:flex-row">
            <Link
              href="/browse"
              className="group relative inline-flex items-center justify-center gap-3 overflow-hidden rounded-full bg-white px-8 py-4 text-base font-semibold text-black transition-transform hover:scale-[1.02] hover:shadow-[0_0_40px_-10px_rgba(255,255,255,0.4)]"
            >
              <span className="relative z-10">Browse the Library</span>
              <ArrowRight className="relative z-10 size-4 transition-transform group-hover:translate-x-1" />
              <div className="absolute inset-0 z-0 bg-gradient-to-r from-white via-zinc-200 to-white opacity-0 transition-opacity group-hover:opacity-100" />
            </Link>
            <a
              href="#featured-reads"
              className="inline-flex items-center gap-2 rounded-full border border-white/10 px-8 py-4 text-base font-medium text-white/70 transition-colors hover:border-white/30 hover:bg-white/5 hover:text-white"
            >
              Start with Featured Reads
            </a>
          </div>

          <p className="mt-12 text-sm font-semibold uppercase tracking-widest text-zinc-500">
            Read less noise. Keep more signal.
          </p>
        </div>
      </Reveal>
    </section>
  );
}

/* ==========================================================================
   Footer
   ========================================================================== */

function LandingFooter() {
  return (
    <footer className="border-t border-white/[0.04] py-12">
      <div className="mx-auto flex max-w-7xl px-6 lg:px-8 flex-col items-center justify-between gap-6 sm:flex-row">
        <div className="flex items-center gap-3 text-sm text-muted-foreground/60">
          <span>{APP_NAME} — Curated knowledge platform</span>
        </div>

        <div className="flex items-center gap-6 text-sm text-muted-foreground/60">
          <Link href="/about" className="transition-colors hover:text-foreground">
            About
          </Link>
          <Link href="/privacy" className="transition-colors hover:text-foreground">
            Privacy
          </Link>
          <Link href="/terms" className="transition-colors hover:text-foreground">
            Terms
          </Link>
        </div>
      </div>
    </footer>
  );
}
