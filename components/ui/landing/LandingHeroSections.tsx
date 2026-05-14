"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { Logo } from "@/components/ui/Logo";

const HERO_ROTATING_WORDS = ["remembered", "searchable", "connected", "actionable"] as const;
const HERO_ROTATION_INTERVAL_MS = 3000;
const PRIMARY_CTA_CLASS =
  "focus-ring group relative inline-flex items-center justify-center gap-3 overflow-hidden rounded-full bg-white px-8 py-4 text-base font-semibold text-black transition-[transform,box-shadow,background-color] duration-300 hover:-translate-y-0.5 hover:shadow-[0_16px_40px_-16px_rgba(255,255,255,0.45)]";
const SECONDARY_CTA_CLASS =
  "focus-ring inline-flex items-center justify-center rounded-full border border-white/10 bg-white/[0.02] px-8 py-4 text-base font-medium text-white/75 transition-[border-color,background-color,color,transform] duration-300 hover:-translate-y-0.5 hover:border-white/25 hover:bg-white/[0.06] hover:text-white";

export function LandingHeader() {
  return (
    <header className="sticky top-0 z-50 border-b border-white/[0.08] bg-background/95 backdrop-blur-xl">
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
    <section className="landing-hero-section relative flex min-h-[90vh] flex-col justify-center overflow-hidden pb-24 pt-20 sm:pt-24">
      <div className="relative z-10 mx-auto grid max-w-7xl gap-16 px-6 lg:grid-cols-[1fr_1fr] lg:items-center lg:px-8">
        <div className="max-w-2xl">
          <div>
            <p className="mb-8 text-[0.72rem] font-semibold uppercase tracking-[0.24em] text-zinc-400">
              A summary-first knowledge system
            </p>
          </div>

          <div>
            <h1 className="font-serif text-5xl font-bold leading-[0.98] tracking-[-0.045em] text-white sm:text-7xl lg:text-[5.15rem]">
              <span className="sr-only">Every idea, remembered.</span>
              <span aria-hidden="true" className="block">Every idea,</span>
              <span aria-hidden="true" className="landing-rotating-word-shell mt-2 block text-transparent sm:mt-3">
                <RotatingHeroWord />
              </span>
            </h1>
          </div>

          <div>
            <p className="mt-8 max-w-xl text-lg leading-8 text-zinc-300 sm:text-[1.18rem]">
              Netflux turns books, podcasts, articles, and videos into structured knowledge you can search, revisit, and remember.
            </p>
          </div>

          <div className="mt-10">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
              <Link href="/login" className={PRIMARY_CTA_CLASS}>
                <span className="relative z-10">Start Reading Free</span>
                <ArrowRight className="relative z-10 size-4 transition-transform group-hover:translate-x-1" />
                <div className="absolute inset-0 z-0 bg-gradient-to-r from-white via-zinc-100 to-white opacity-0 transition-opacity duration-300 group-hover:opacity-100" />
              </Link>
              <Link href="/browse" className={SECONDARY_CTA_CLASS}>
                Browse Library
              </Link>
            </div>
          </div>
        </div>

        <div className="relative hidden lg:block">
          <div className="pointer-events-none absolute inset-x-8 -top-6 h-20 bg-gradient-to-b from-white/[0.04] to-transparent blur-3xl" />
          <div className="landing-device-stage relative z-20 w-full">
            <div className="landing-device-card relative aspect-[2790/1792] w-full overflow-hidden rounded-2xl border border-white/10 bg-black shadow-[0_30px_80px_-20px_rgba(0,0,0,0.7),0_0_30px_rgba(255,255,255,0.04)]">
              <Image
                src="/images/hero-section.webp"
                alt="Netflux dashboard desktop experience"
                fill
                priority
                sizes="(max-width: 1024px) 0px, 700px"
                className="object-cover opacity-90"
              />
              <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/[0.22] via-transparent to-white/[0.03]" />
              <div className="pointer-events-none absolute inset-0 rounded-2xl ring-1 ring-inset ring-white/10" />
            </div>

            <div className="landing-device-phone absolute -bottom-8 -left-6 z-30 aspect-[1206/2306] w-[140px] overflow-hidden rounded-[1.25rem] border-[4px] border-[#1c1c1e] bg-black shadow-[0_20px_50px_-10px_rgba(0,0,0,0.8),0_0_20px_rgba(0,0,0,0.4)]">
              <Image
                src="/images/mobile-reader-view.png"
                alt="Netflux mobile reader experience"
                fill
                sizes="140px"
                className="object-contain"
              />
              <div className="absolute left-1/2 top-0 z-20 h-3 w-14 -translate-x-1/2 rounded-b-lg bg-[#1c1c1e]" />
            </div>
          </div>
        </div>
      </div>
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
