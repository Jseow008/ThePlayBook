"use client";

import type { CSSProperties } from "react";
import { Fragment, useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { BackgroundScroll } from "@/components/ui/background-scroll-animation";
import { Logo } from "@/components/ui/Logo";

const HERO_WORKFLOW_STEPS = ["Discover", "Understand", "Save", "Recall"] as const;
const HERO_WORKFLOW_INTERVAL_MS = 2800;
const heroRevealStyle = (delay: string) =>
  ({ "--hero-reveal-delay": delay } as CSSProperties);
const PRIMARY_CTA_CLASS =
  "focus-ring landing-primary-cta group relative inline-flex w-full min-w-0 items-center justify-center gap-3 overflow-hidden rounded-full bg-white px-8 py-4 text-base font-semibold text-black transition-[transform,box-shadow,background-color] duration-300 hover:-translate-y-0.5 sm:w-auto";
const SECONDARY_CTA_CLASS =
  "focus-ring landing-secondary-cta inline-flex w-full min-w-0 items-center justify-center rounded-full border border-white/[0.18] bg-white/[0.07] px-8 py-4 text-base font-medium text-white/90 transition-[border-color,background-color,color,transform,box-shadow] duration-300 hover:-translate-y-0.5 hover:border-white/30 hover:bg-white/[0.11] hover:text-white sm:w-auto";

export function LandingHeader() {
  return (
    <header className="landing-header sticky top-0 z-50 border-b border-white/[0.08] bg-background/95 backdrop-blur-xl">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6">
        <Link href="/" className="focus-ring inline-flex items-center gap-2 rounded-sm">
          <Logo
            width={104}
            height={28}
            className="brightness-110 drop-shadow-[0_1px_8px_rgba(255,255,255,0.08)]"
          />
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
            className="focus-ring inline-flex items-center rounded-full border border-white/[0.08] bg-white/[0.02] px-3 py-1.5 text-xs font-semibold text-foreground transition-all duration-300 hover:-translate-y-0.5 hover:border-white/20 hover:bg-white/[0.06] hover:shadow-[0_10px_24px_-16px_rgba(255,255,255,0.5)] sm:px-4 sm:py-2 sm:text-sm"
          >
            Sign In
          </Link>
        </div>
      </div>
    </header>
  );
}

export function HeroSection() {
  return (
    <section className="landing-hero-section relative">
      <BackgroundScroll
        foregroundClassName="max-w-7xl"
        foreground={
          <>
            <h1
              className="landing-hero-reveal mx-auto max-w-full font-serif text-[1.8rem] font-normal leading-[1.08] tracking-[-0.045em] text-white sm:text-6xl sm:leading-[1.05] md:text-[3.55rem] lg:text-[4.65rem]"
              style={heroRevealStyle("80ms")}
            >
              <span className="sr-only">From passive consumption to knowledge that compounds.</span>

              <span aria-hidden="true" className="block sm:hidden">
                <span className="relative left-1/2 block w-fit max-w-none -translate-x-1/2 whitespace-nowrap">From passive consumption</span>
                <span className="mx-auto mt-2 block w-fit max-w-none whitespace-nowrap">to knowledge that</span>
                <span className="landing-hero-emphasis mx-auto mt-2 block w-fit max-w-full">
                  compounds.
                </span>
              </span>

              <span aria-hidden="true" className="hidden sm:block">
                <span className="mx-auto block w-fit max-w-full md:whitespace-nowrap">From passive consumption</span>
                <span className="mx-auto mt-3 block w-fit max-w-full md:whitespace-nowrap">
                  to knowledge that{" "}
                  <span className="landing-hero-emphasis">compounds.</span>
                </span>
              </span>
            </h1>

            <p
              className="landing-hero-reveal landing-hero-copy mx-auto mt-10 max-w-2xl text-lg leading-8 text-zinc-300 sm:text-[1.18rem]"
              style={heroRevealStyle("260ms")}
            >
              Netflux turns books, podcasts, articles, and videos into summaries, highlights, and saved ideas you can search and revisit.
            </p>

            <HeroWorkflow />

            <div
              className="landing-hero-reveal mt-7 flex flex-col justify-center gap-4 sm:flex-row sm:items-center"
              style={heroRevealStyle("560ms")}
            >
              <Link href="/browse" className={PRIMARY_CTA_CLASS}>
                <span className="relative z-10">Explore the Library</span>
                <ArrowRight className="relative z-10 size-4 transition-transform group-hover:translate-x-1" />
              </Link>
              <Link href="/login" className={SECONDARY_CTA_CLASS}>
                Sign Up Free
              </Link>
            </div>
          </>
        }
      >
        <Image
          src="/images/landing-page-library.webp"
          alt=""
          fill
          priority
          sizes="100vw"
          className="landing-hero-background-image object-cover object-[42%_center] md:object-center"
        />
      </BackgroundScroll>
    </section>
  );
}

function HeroWorkflow() {
  const [activeIndex, setActiveIndex] = useState(0);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const motionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    let intervalId: number | null = null;

    const stopProgression = () => {
      if (intervalId !== null) {
        window.clearInterval(intervalId);
        intervalId = null;
      }
    };

    const startProgression = () => {
      if (motionQuery.matches || document.hidden || intervalId !== null) return;

      intervalId = window.setInterval(() => {
        setActiveIndex((currentIndex) => (currentIndex + 1) % HERO_WORKFLOW_STEPS.length);
      }, HERO_WORKFLOW_INTERVAL_MS);
    };

    const syncProgression = () => {
      if (motionQuery.matches || document.hidden) {
        stopProgression();
        return;
      }

      startProgression();
    };

    syncProgression();
    motionQuery.addEventListener("change", syncProgression);
    document.addEventListener("visibilitychange", syncProgression);

    return () => {
      motionQuery.removeEventListener("change", syncProgression);
      document.removeEventListener("visibilitychange", syncProgression);
      stopProgression();
    };
  }, []);

  return (
    <div
      className="landing-hero-reveal landing-hero-workflow mx-auto mt-7 sm:mt-8"
      style={heroRevealStyle("410ms")}
      aria-label="Netflux workflow: Discover, Understand, Save, Recall"
    >
      <div className="flex flex-nowrap items-center justify-center gap-2 sm:gap-4" aria-hidden="true">
        {HERO_WORKFLOW_STEPS.map((step, index) => (
          <Fragment key={step}>
            <HeroWorkflowStep step={step} isActive={index === activeIndex} />
            {index < HERO_WORKFLOW_STEPS.length - 1 ? (
              <HeroWorkflowConnector isActive={index === activeIndex} />
            ) : null}
          </Fragment>
        ))}
      </div>
    </div>
  );
}

function HeroWorkflowStep({
  step,
  isActive,
}: {
  step: (typeof HERO_WORKFLOW_STEPS)[number];
  isActive: boolean;
}) {
  return (
    <div className="landing-hero-workflow-step flex shrink-0 items-center gap-1.5 sm:gap-2.5" data-active={isActive}>
      <span className="landing-hero-workflow-marker" />
      <span className="text-[0.56rem] font-semibold uppercase tracking-[0.08em] sm:text-[0.72rem] sm:tracking-[0.13em]">
        {step}
      </span>
    </div>
  );
}

function HeroWorkflowConnector({ isActive }: { isActive: boolean }) {
  return (
    <span className="landing-hero-workflow-connector" data-active={isActive} />
  );
}
