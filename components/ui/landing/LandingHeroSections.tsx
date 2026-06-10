"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { BackgroundScroll } from "@/components/ui/background-scroll-animation";
import { Logo } from "@/components/ui/Logo";

const HERO_ROTATING_WORDS = ["remembered", "searchable", "connected", "actionable"] as const;
const HERO_ROTATION_INTERVAL_MS = 3000;
const PRIMARY_CTA_CLASS =
  "focus-ring landing-primary-cta group relative inline-flex w-full min-w-0 items-center justify-center gap-3 overflow-hidden rounded-full bg-white px-8 py-4 text-base font-semibold text-black transition-[transform,box-shadow,background-color] duration-300 hover:-translate-y-0.5 sm:w-auto";
const SECONDARY_CTA_CLASS =
  "focus-ring landing-secondary-cta inline-flex w-full min-w-0 items-center justify-center rounded-full border border-white/10 bg-white/[0.02] px-8 py-4 text-base font-medium text-white/75 transition-[border-color,background-color,color,transform,box-shadow] duration-300 hover:-translate-y-0.5 hover:border-white/25 hover:bg-white/[0.06] hover:text-white sm:w-auto";

export function LandingHeader() {
  return (
    <header className="landing-header sticky top-0 z-50 border-b border-white/[0.08] bg-background/95 backdrop-blur-xl">
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
        foreground={
          <>
            <h1 className="mx-auto max-w-full font-serif text-5xl font-normal leading-[0.98] tracking-[-0.045em] text-white sm:text-7xl lg:text-[5.75rem]">
              <span className="sr-only">Every idea, remembered.</span>
              <span aria-hidden="true" className="block">Every idea,</span>
              <span aria-hidden="true" className="landing-rotating-word-shell mt-2 block text-transparent sm:mt-3">
                <RotatingHeroWord />
              </span>
            </h1>

            <p className="landing-hero-copy mx-auto mt-8 max-w-2xl text-lg leading-8 text-zinc-300 sm:text-[1.18rem]">
              Turning books, podcasts, articles, and videos into searchable summaries, highlights, and saved ideas you can revisit when they matter.
            </p>

            <div className="mt-10 flex flex-col justify-center gap-4 sm:flex-row sm:items-center">
              <Link href="/login" className={PRIMARY_CTA_CLASS}>
                <span className="relative z-10">Start Your Library</span>
                <ArrowRight className="relative z-10 size-4 transition-transform group-hover:translate-x-1" />
              </Link>
              <Link href="/browse" className={SECONDARY_CTA_CLASS}>
                Browse Summaries
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
          className="object-cover object-[42%_center] md:object-center"
        />
      </BackgroundScroll>
    </section>
  );
}

function RotatingHeroWord() {
  const [activeIndex, setActiveIndex] = useState(0);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const motionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    let intervalId: number | null = null;

    const stopRotation = () => {
      if (intervalId !== null) {
        window.clearInterval(intervalId);
        intervalId = null;
      }

      setActiveIndex(0);
    };

    const startRotation = () => {
      if (motionQuery.matches || intervalId !== null) return;

      intervalId = window.setInterval(() => {
        setActiveIndex((currentIndex) => (currentIndex + 1) % HERO_ROTATING_WORDS.length);
      }, HERO_ROTATION_INTERVAL_MS);
    };

    const handleMotionPreferenceChange = () => {
      if (motionQuery.matches) {
        stopRotation();
        return;
      }

      startRotation();
    };

    handleMotionPreferenceChange();
    motionQuery.addEventListener("change", handleMotionPreferenceChange);

    return () => {
      motionQuery.removeEventListener("change", handleMotionPreferenceChange);
      stopRotation();
    };
  }, []);

  return (
    <span key={HERO_ROTATING_WORDS[activeIndex]} className="landing-rotating-word inline-block">
      {HERO_ROTATING_WORDS[activeIndex]}
    </span>
  );
}
