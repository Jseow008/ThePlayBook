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

interface LandingPageProps {
  featuredItems: ContentItem[];
  categories: { category: string; count: number }[];
  totalContentCount: number;
  totalCategoryCount?: number;
}

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
  image: "/images/Reading Experience Section Reader View.png",
} as const;

const CORE_SUPPORT_FEATURES = [
  {
    icon: BookMarked,
    title: "Preview before you commit",
    description: "See the main idea and understand the thesis before you dive in.",
    image: "/images/Reading Experience Section Info View.png",
  },
  {
    icon: NotebookPen,
    title: "Highlight and annotate",
    description: "Capture the passages worth remembering while you read.",
    image: "/images/Highlighting & Annotation.png",
  },
  {
    icon: Sparkles,
    title: "Ask the author",
    description: "Ask the author(s) questions about what you just read.",
    image: "/images/AI Chat .png",
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

function fadeInStyle(delayMs = 0) {
  return {
    animationDelay: `${delayMs}ms`,
    animationFillMode: "both" as const,
  };
}

function FadeIn({
  children,
  className,
  delayMs = 0,
}: {
  children: React.ReactNode;
  className?: string;
  delayMs?: number;
}) {
  return (
    <div className={cn("animate-fade-in", className)} style={fadeInStyle(delayMs)}>
      {children}
    </div>
  );
}

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

function getCuratedCategories(categories: { category: string; count: number }[]) {
  const categoryMap = new Map(categories.map((item) => [item.category, item]));
  return CURATED_CATEGORY_ORDER.map((name) => categoryMap.get(name)).filter(
    (item): item is { category: string; count: number } => Boolean(item)
  );
}

export function LandingPage({ featuredItems, categories }: LandingPageProps) {
  const curatedCategories = getCuratedCategories(categories);

  return (
    <>
      <LandingHeader />

      <main className="relative min-h-screen overflow-x-hidden bg-background text-foreground">
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

function LandingHeader() {
  return (
    <header className="sticky top-0 z-50 border-b border-white/[0.08] bg-background/82 backdrop-blur-xl">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6">
        <Link href="/" className="inline-flex items-center gap-2">
          <Logo width={88} height={24} />
        </Link>

        <div className="flex items-center gap-3 sm:gap-4">
          <Link
            href="/browse"
            className="hidden text-sm font-medium text-muted-foreground transition-colors hover:text-foreground sm:inline-flex"
          >
            Browse
          </Link>
          <Link
            href="/login"
            className="inline-flex items-center rounded-full border border-white/[0.08] px-3 py-1.5 text-xs font-semibold text-foreground transition-all hover:bg-white/[0.04] sm:px-4 sm:py-2 sm:text-sm"
          >
            Sign In
          </Link>
        </div>
      </div>
    </header>
  );
}

function HeroSection() {
  return (
    <section className="relative flex min-h-[90vh] flex-col justify-center overflow-hidden pb-24 pt-20 sm:pt-24">
      <div className="pointer-events-none absolute inset-0 z-0 opacity-60">
        <div className="landing-hero-flow-1 absolute left-1/4 top-1/4 h-[320px] w-[320px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-blue-500/10 blur-[80px]" />
        <div className="landing-hero-flow-2 absolute bottom-1/4 right-1/4 h-[400px] w-[400px] translate-x-1/4 translate-y-1/4 rounded-full bg-emerald-500/5 blur-[80px]" />
      </div>

      <div className="relative z-10 mx-auto grid max-w-7xl gap-16 px-6 lg:px-8 lg:grid-cols-[1fr_1fr] lg:items-center">
        <div className="max-w-2xl">
          <FadeIn delayMs={40}>
            <p className="mb-8 text-xs font-semibold uppercase tracking-[0.3em] text-white/50">
              Curated knowledge platform
            </p>
          </FadeIn>

          <FadeIn delayMs={120}>
            <h1 className="font-serif text-5xl font-bold leading-[1.05] tracking-tight text-white sm:text-7xl lg:text-[5.5rem]">
              The world&apos;s best ideas, distilled.
            </h1>
          </FadeIn>

          <FadeIn delayMs={200}>
            <p className="mt-8 max-w-xl text-lg leading-relaxed text-zinc-400 sm:text-xl">
              {APP_NAME} transforms books, podcasts, and articles into structured,
              actionable knowledge you can actually retain and use.
            </p>
          </FadeIn>

          <FadeIn delayMs={280} className="mt-10">
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

            <div className="mt-6 flex flex-wrap items-center gap-x-6 gap-y-3 text-sm font-medium text-zinc-500">
              {PROOF_POINTS.map((point) => (
                <span key={point} className="inline-flex items-center gap-2">
                  <span className="size-1.5 rounded-full bg-white/20" />
                  {point}
                </span>
              ))}
            </div>
          </FadeIn>
        </div>

        <FadeIn delayMs={180} className="relative hidden lg:block">
          <div className="relative z-20 w-full">
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

            <div className="absolute -bottom-8 -left-6 z-30 aspect-[1206/2306] w-[140px] overflow-hidden rounded-[1.25rem] border-[4px] border-[#1c1c1e] bg-black shadow-[0_20px_50px_-10px_rgba(0,0,0,0.8),0_0_20px_rgba(0,0,0,0.4)]">
              <Image
                src="/images/Mobile Reader View.png"
                alt="Flux mobile reader experience"
                fill
                sizes="140px"
                className="object-cover"
              />
              <div className="absolute top-0 left-1/2 h-3 w-14 -translate-x-1/2 rounded-b-lg bg-[#1c1c1e]" />
            </div>
          </div>
        </FadeIn>
      </div>
    </section>
  );
}

function FeaturedReadsSection({ items }: { items: ContentItem[] }) {
  return (
    <section id="featured-reads" className="scroll-mt-20 overflow-hidden bg-black/50 py-24 sm:py-32">
      <FadeIn className="mx-auto mb-16 max-w-7xl px-6">
        <SectionIntro
          label="Start here"
          title="A few ideas worth your attention right now."
          body="A curated selection of high-signal reads to help you think better, work better, and live with more intention."
        />
      </FadeIn>

      <div className="mx-auto max-w-7xl px-6">
        <div className="-mx-6 overflow-x-auto px-6 pb-4">
          <div className="flex min-w-max gap-4 sm:gap-6">
            {items.map((item) => (
              <div
                key={item.id}
                className="relative w-[160px] flex-none shrink-0 sm:w-[200px] md:w-[240px]"
              >
                <ContentCard
                  item={item}
                  enableUserState={false}
                  hideBookmark
                  hideProgressBar
                />
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

function ProblemSolutionSection() {
  return (
    <section className="relative overflow-hidden py-24 sm:py-32">
      <div className="relative z-10 mx-auto grid max-w-7xl gap-8 px-6 md:grid-cols-2 md:gap-12 lg:px-8">
        <FadeIn>
          <div className="rounded-[32px] border border-white/10 bg-gradient-to-br from-white/5 to-white/[0.01] p-10 sm:p-12">
            <p className="text-sm font-semibold uppercase tracking-[0.3em] text-white/50">
              Why {APP_NAME}
            </p>
            <h2 className="mt-8 text-balance font-serif text-4xl font-bold tracking-tight text-white sm:text-5xl lg:text-6xl">
              Most people consume more than they remember.
            </h2>
            <p className="mt-6 text-lg leading-relaxed text-zinc-400">
              Podcasts, books, and articles can be full of value, but most of it disappears as quickly as it arrives.
              The problem is rarely access. It&apos;s retention.
            </p>
          </div>
        </FadeIn>

        <FadeIn delayMs={120}>
          <div className="relative overflow-hidden rounded-[32px] border border-white/10 bg-black p-10 shadow-2xl sm:p-12">
            <div className="pointer-events-none absolute right-0 top-0 h-48 w-48 rounded-full bg-emerald-500/8 blur-[60px]" />

            <div className="relative z-10">
              <p className="text-sm font-semibold uppercase tracking-[0.3em] text-white/50">
                The answer
              </p>
              <h2 className="mt-8 text-balance font-serif text-4xl font-bold tracking-tight text-white sm:text-5xl lg:text-6xl">
                {APP_NAME} turns information into something you can keep.
              </h2>
              <p className="mt-6 text-lg leading-relaxed text-zinc-400">
                Each piece is distilled into a clear reading experience built for understanding, recall, and reuse, so the
                best ideas stay available when they matter.
              </p>
            </div>
          </div>
        </FadeIn>
      </div>
    </section>
  );
}

function HowItWorksSection() {
  return (
    <section className="bg-black py-24 sm:py-32">
      <div className="mx-auto max-w-7xl px-6 lg:px-8">
        <FadeIn>
          <SectionIntro
            label="How it works"
            title="A better loop for learning from what you consume."
            body={`${APP_NAME} is designed to move ideas from discovery to understanding to long-term usefulness.`}
          />
        </FadeIn>

        <div className="mt-16 grid gap-8 sm:grid-cols-2 lg:grid-cols-4">
          {WORKFLOW_STEPS.map((step, index) => (
            <FadeIn key={step.number} delayMs={index * 80}>
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
            </FadeIn>
          ))}
        </div>
      </div>
    </section>
  );
}

function CorePlatformFeaturesSection() {
  return (
    <section className="bg-black py-24 sm:py-32">
      <FadeIn className="mx-auto max-w-7xl px-6 lg:px-8">
        <div className="relative overflow-hidden rounded-[3rem] border border-white/10 bg-gradient-to-br from-white/5 to-white/[0.01] p-10 sm:p-14 lg:p-16">
          <div className="pointer-events-none absolute inset-0 rounded-[3rem] bg-emerald-500/5 blur-[60px]" />
          <div className="relative z-10 grid gap-16 lg:grid-cols-[0.88fr_1.12fr] lg:items-center">
            <div className="max-w-md">
              <SectionIntro
                label="Reading, upgraded"
                title="Built for understanding, not just browsing."
                body={`${APP_NAME} helps you build a personal layer around the ideas you consume. Discover the core idea quickly, and make what you read more useful over time.`}
              />
            </div>

            <div className="grid gap-6 sm:grid-cols-2 lg:items-center">
              <FadeIn delayMs={100}>
                <div className="group flex flex-col overflow-hidden rounded-[2rem] border border-white/10 bg-black/80 transition-all hover:border-white/20 hover:bg-zinc-900/90 hover:shadow-2xl">
                  <div className="relative aspect-[1996/1794] w-full shrink-0 overflow-hidden border-b border-white/5 bg-zinc-950">
                    <Image
                      src={CORE_ANCHOR_FEATURE.image}
                      alt={`Screenshot illustrating ${CORE_ANCHOR_FEATURE.title}`}
                      fill
                      sizes="(max-width: 640px) 100vw, 50vw"
                      className="object-cover object-top opacity-90 transition-transform duration-300 group-hover:scale-105 group-hover:opacity-100"
                    />
                    <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/50 via-transparent to-transparent" />
                  </div>

                  <div className="flex flex-1 flex-col p-8 pt-6">
                    <h3 className="text-2xl font-semibold tracking-tight text-white">
                      {CORE_ANCHOR_FEATURE.title}
                    </h3>
                    <p className="mt-3 text-base leading-relaxed text-zinc-400">
                      {CORE_ANCHOR_FEATURE.description}
                    </p>
                  </div>
                </div>
              </FadeIn>

              <div className="flex flex-col gap-6">
                {CORE_SUPPORT_FEATURES.map((feature, index) => (
                  <FadeIn key={feature.title} delayMs={150 + index * 80}>
                    <div className="group relative flex flex-row items-center gap-5 overflow-hidden rounded-[2rem] border border-white/10 bg-black/80 p-3 transition-all hover:border-white/20 hover:bg-zinc-900/90 hover:shadow-xl">
                      <div className="relative h-24 w-24 shrink-0 overflow-hidden rounded-2xl border border-white/5 bg-zinc-950">
                        <Image
                          src={feature.image}
                          alt={`Screenshot illustrating ${feature.title}`}
                          fill
                          sizes="96px"
                          className="object-cover object-top opacity-80 transition-transform duration-300 group-hover:scale-[1.05] group-hover:opacity-100"
                        />
                        <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/60 to-transparent" />

                        <div className="absolute bottom-2 left-2 flex h-6 w-6 items-center justify-center rounded-lg border border-white/10 bg-black/50 backdrop-blur-md">
                          <feature.icon className="h-3 w-3 text-zinc-300" />
                        </div>
                      </div>

                      <div className="flex flex-1 flex-col py-2 pr-4">
                        <h3 className="text-[15px] font-semibold leading-snug tracking-tight text-white">
                          {feature.title}
                        </h3>
                        <p className="mt-1 text-sm leading-relaxed text-zinc-400">
                          {feature.description}
                        </p>
                      </div>
                    </div>
                  </FadeIn>
                ))}
              </div>
            </div>
          </div>
        </div>
      </FadeIn>
    </section>
  );
}

function TopicMapSection({ categories }: { categories: { category: string; count: number }[] }) {
  return (
    <section className="py-24 sm:py-32">
      <div className="mx-auto max-w-7xl px-6 lg:px-8">
        <FadeIn>
          <SectionIntro
            label="Explore by domain"
            title="Browse the ideas shaping how people think, work, and live."
            body="Move through the library by theme. Start with what matters most to you."
            centered
          />
        </FadeIn>

        <div className="mt-16 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
          {categories.map((item, index) => {
            const Icon = CATEGORY_ICONS[item.category as keyof typeof CATEGORY_ICONS] || Sparkles;

            return (
              <FadeIn key={item.category} delayMs={index * 50}>
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
              </FadeIn>
            );
          })}
        </div>
      </div>
    </section>
  );
}

function FinalCTASection() {
  return (
    <section className="relative overflow-hidden py-32 sm:py-40">
      <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
        <div className="h-[300px] w-[600px] rounded-full bg-blue-500/8 blur-[80px]" />
      </div>

      <FadeIn>
        <div className="relative z-10 mx-auto max-w-4xl px-6 text-center lg:px-8">
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
      </FadeIn>
    </section>
  );
}

function LandingFooter() {
  return (
    <footer className="border-t border-white/[0.04] py-12">
      <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-6 px-6 sm:flex-row lg:px-8">
        <div className="flex items-center gap-3 text-sm text-muted-foreground/60">
          <span>{APP_NAME} - Curated knowledge platform</span>
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
