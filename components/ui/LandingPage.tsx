import Image from "next/image";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
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
  "Politics",
] as const;

const PROOF_POINTS = [
  "Structured summaries",
  "Highlights and notes",
  "Ask the author",
] as const;

const CORE_ANCHOR_FEATURE = {
  title: "Reading view",
  description: "Read in clear, structured sections designed for focus.",
  image: "/images/reading-experience-reader-view.png",
} as const;

const CORE_SUPPORT_FEATURES = [
  {
    title: "Preview the thesis",
    description: "See the main idea and understand the thesis before you dive in.",
    image: "/images/reading-experience-info-view.png",
  },
  {
    title: "Highlight and annotate",
    description: "Capture the passages worth remembering while you read.",
    image: "/images/highlighting-and-annotation.png",
  },
  {
    title: "Ask follow-up questions",
    description: "Ask the author(s) questions about what you just read.",
    image: "/images/ai-chat.png",
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
      <p className="mb-4 text-[0.72rem] font-semibold uppercase tracking-[0.24em] text-zinc-400">
        {label}
      </p>
      <h2 className="font-serif text-4xl font-bold leading-[1.02] tracking-[-0.035em] text-white sm:text-5xl md:text-[3.65rem]">
        {title}
      </h2>
      {body ? (
        <p className="mt-6 text-base leading-8 text-zinc-300 sm:text-[1.15rem]">{body}</p>
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
        <CorePlatformFeaturesSection />

        {featuredItems.length > 0 ? <FeaturedReadsSection items={featuredItems} /> : null}
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
        <Link href="/" className="focus-ring inline-flex items-center gap-2 rounded-sm">
          <Logo width={88} height={24} />
        </Link>

        <div className="flex items-center gap-3 sm:gap-4">
          <Link
            href="/browse"
            className="focus-ring hidden rounded-sm text-sm font-medium text-muted-foreground transition-colors hover:text-foreground sm:inline-flex"
          >
            Browse
          </Link>
          <Link
            href="/login"
            className="focus-ring inline-flex items-center rounded-full border border-white/[0.08] px-3 py-1.5 text-xs font-semibold text-foreground transition-all hover:bg-white/[0.04] sm:px-4 sm:py-2 sm:text-sm"
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
          <div>
            <p className="mb-8 text-[0.72rem] font-semibold uppercase tracking-[0.24em] text-zinc-400">
              Curated knowledge platform
            </p>
          </div>

          <div>
            <h1 className="font-serif text-5xl font-bold leading-[0.98] tracking-[-0.045em] text-white sm:text-7xl lg:text-[5.15rem]">
              Read the best ideas without losing what matters.
            </h1>
          </div>

          <div>
            <p className="mt-8 max-w-xl text-lg leading-8 text-zinc-300 sm:text-[1.18rem]">
              {APP_NAME} turns books, podcasts, and articles into structured reading
              experiences you can highlight, revisit, and actually use.
            </p>
          </div>

          <div className="mt-10">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
              <Link
                href="/login"
                className="focus-ring group relative inline-flex items-center justify-center gap-3 overflow-hidden rounded-full bg-white px-8 py-4 text-base font-semibold text-black transition-transform hover:scale-[1.02] hover:shadow-[0_0_40px_-10px_rgba(255,255,255,0.4)]"
              >
                <span className="relative z-10">Start Reading</span>
                <ArrowRight className="relative z-10 size-4 transition-transform group-hover:translate-x-1" />
                <div className="absolute inset-0 z-0 bg-gradient-to-r from-white via-zinc-200 to-white opacity-0 transition-opacity group-hover:opacity-100" />
              </Link>
              <Link
                href="/browse"
                className="focus-ring inline-flex items-center justify-center rounded-full border border-white/10 px-8 py-4 text-base font-medium text-white/70 transition-colors hover:border-white/30 hover:bg-white/5 hover:text-white"
              >
                Browse the Library
              </Link>
            </div>

            <div className="mt-6 flex flex-wrap items-center gap-x-6 gap-y-3 text-sm font-medium text-zinc-400">
              {PROOF_POINTS.map((point) => (
                <span key={point} className="inline-flex items-center gap-2">
                  <span className="size-1.5 rounded-full bg-white/20" />
                  {point}
                </span>
              ))}
            </div>
          </div>
        </div>

        <div className="relative hidden lg:block">
          <div className="relative z-20 w-full">
            <div className="relative aspect-[2790/1792] w-full overflow-hidden rounded-2xl border border-white/10 bg-black shadow-[0_30px_80px_-20px_rgba(0,0,0,0.7),0_0_30px_rgba(255,255,255,0.04)]">
              <Image
                src="/images/hero-section.png"
                alt="Flux dashboard desktop experience"
                fill
                priority
                unoptimized
                sizes="(max-width: 1024px) 0px, 700px"
                className="object-cover opacity-90"
              />
              <div className="pointer-events-none absolute inset-0 rounded-2xl ring-1 ring-inset ring-white/10" />
            </div>

            <div className="absolute -bottom-8 -left-6 z-30 aspect-[1206/2306] w-[140px] overflow-hidden rounded-[1.25rem] border-[4px] border-[#1c1c1e] bg-black shadow-[0_20px_50px_-10px_rgba(0,0,0,0.8),0_0_20px_rgba(0,0,0,0.4)]">
              <Image
                src="/images/mobile-reader-view.png"
                alt="Flux mobile reader experience"
                fill
                unoptimized
                sizes="140px"
                className="object-cover"
              />
              <div className="absolute top-0 left-1/2 h-3 w-14 -translate-x-1/2 rounded-b-lg bg-[#1c1c1e]" />
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function FeaturedReadsSection({ items }: { items: ContentItem[] }) {
  if (items.length === 0) return null;

  // Duplicate items for seamless CSS loop. Keep multiplier low.
  const multiplier = Math.max(2, Math.ceil(16 / Math.max(1, items.length)));
  const displayItems = Array.from({ length: multiplier }).flatMap(() => items);

  return (
    <section id="featured-reads" className="scroll-mt-20 overflow-hidden bg-black/50 py-24 sm:py-32">
      <FadeIn className="mx-auto mb-16 max-w-7xl px-6">
        <SectionIntro
          label="Start here"
          title="Start with something worth your time."
          body="A living library of high-signal ideas across books, podcasts, and articles."
        />
      </FadeIn>

      <FadeIn delayMs={100}>
        <div className="relative mx-auto flex w-full max-w-7xl overflow-hidden pb-8 py-4">
          <div className="landing-carousel-track flex w-max items-center gap-4 px-4 sm:gap-6 sm:px-6">
            {displayItems.map((item, index) => (
              <div
                key={`${item.id}-${index}`}
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
      </FadeIn>
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
                label="How Flux helps"
                title="From first insight to lasting reference."
                body="Preview the core idea, read in clean sections, mark what matters, and come back when the idea becomes useful."
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
                      unoptimized
                      sizes="(max-width: 640px) 100vw, 50vw"
                      className="object-cover object-top opacity-90 transition-transform duration-300 group-hover:scale-105 group-hover:opacity-100"
                    />
                    <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/50 via-transparent to-transparent" />
                  </div>

                  <div className="flex flex-1 flex-col p-8 pt-6">
                    <h3 className="text-2xl font-semibold tracking-tight text-white">
                      {CORE_ANCHOR_FEATURE.title}
                    </h3>
                    <p className="mt-3 text-base leading-8 text-zinc-300">
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
                          unoptimized
                      sizes="96px"
                      className="object-cover object-top opacity-80 transition-transform duration-300 group-hover:scale-[1.05] group-hover:opacity-100"
                        />
                        <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/60 to-transparent" />
                      </div>

                      <div className="flex flex-1 flex-col py-2 pr-4">
                        <h3 className="text-base font-semibold leading-snug tracking-[-0.01em] text-white">
                          {feature.title}
                        </h3>
                        <p className="mt-1 text-sm leading-7 text-zinc-300">
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
            title="Browse by what you want to get better at."
            body="Explore ideas across mindset, health, business, productivity, philosophy, and more."
            centered
          />
        </FadeIn>

        <div className="mt-16 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
          {categories.map((item, index) => {
            return (
              <FadeIn key={item.category} delayMs={index * 50}>
                <Link
                  href={`/search?category=${encodeURIComponent(item.category)}`}
                  className="group flex h-full flex-col items-center justify-center gap-4 rounded-[2rem] border border-white/5 bg-white/5 p-8 text-center transition-all duration-300 hover:-translate-y-1 hover:border-white/20 hover:bg-white/10 hover:shadow-2xl"
                >
                  <span className="text-[0.95rem] font-semibold tracking-[0.01em] text-zinc-300 transition-colors group-hover:text-white">
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
          <h2 className="font-serif text-5xl font-bold leading-[0.98] tracking-[-0.045em] text-white sm:text-6xl md:text-[5.5rem]">
            Build a personal library of ideas you&apos;ll actually return to.
          </h2>

          <p className="mx-auto mt-8 max-w-2xl text-lg leading-8 text-zinc-300 sm:text-[1.18rem]">
            Start reading, save what matters, and turn insight into something durable.
          </p>

          <div className="mt-12 flex flex-col items-center justify-center gap-5 sm:flex-row">
            <Link
              href="/login"
              className="focus-ring group relative inline-flex items-center justify-center gap-3 overflow-hidden rounded-full bg-white px-8 py-4 text-base font-semibold text-black transition-transform hover:scale-[1.02] hover:shadow-[0_0_40px_-10px_rgba(255,255,255,0.4)]"
            >
              <span className="relative z-10">Start Reading</span>
              <ArrowRight className="relative z-10 size-4 transition-transform group-hover:translate-x-1" />
              <div className="absolute inset-0 z-0 bg-gradient-to-r from-white via-zinc-200 to-white opacity-0 transition-opacity group-hover:opacity-100" />
            </Link>
            <Link
              href="/browse"
              className="focus-ring inline-flex items-center gap-2 rounded-full border border-white/10 px-8 py-4 text-base font-medium text-white/70 transition-colors hover:border-white/30 hover:bg-white/5 hover:text-white"
            >
              Browse the Library
            </Link>
          </div>

          <p className="mt-12 text-sm font-semibold uppercase tracking-[0.24em] text-zinc-400">
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
          <Link href="/about" className="focus-ring rounded-sm transition-colors hover:text-foreground">
            About
          </Link>
          <Link href="/privacy" className="focus-ring rounded-sm transition-colors hover:text-foreground">
            Privacy
          </Link>
          <Link href="/terms" className="focus-ring rounded-sm transition-colors hover:text-foreground">
            Terms
          </Link>
        </div>
      </div>
    </footer>
  );
}
