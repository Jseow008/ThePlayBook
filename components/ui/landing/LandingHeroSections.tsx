"use client";

import type { CSSProperties, PointerEvent as ReactPointerEvent } from "react";
import { useEffect, useRef } from "react";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { Logo } from "@/components/ui/Logo";

const heroRevealStyle = (delay: string) =>
  ({ "--hero-reveal-delay": delay } as CSSProperties);
const PRIMARY_CTA_CLASS =
  "focus-ring landing-primary-cta landing-hero-primary-cta group relative inline-flex min-h-11 min-w-0 items-center justify-center gap-2.5 overflow-hidden rounded-full bg-solar-gold px-6 py-3 text-sm font-semibold text-solar-gold-foreground transition-[transform,box-shadow,background-color] duration-300 hover:-translate-y-0.5 active:translate-y-0 active:scale-[0.985] sm:px-7 sm:text-base";
const SECONDARY_CTA_CLASS =
  "focus-ring landing-secondary-cta inline-flex min-h-11 items-center justify-center rounded-full border border-white/[0.14] bg-white/[0.025] px-5 text-sm font-semibold text-zinc-300 transition-[border-color,background-color,color,transform] duration-200 hover:-translate-y-px hover:border-white/25 hover:bg-white/[0.055] hover:text-white active:translate-y-0 active:scale-[0.985]";

export function LandingHeader() {
  return (
    <header className="landing-header sticky top-0 z-50 border-b border-white/[0.08] bg-background/95 backdrop-blur-xl">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6">
        <Link href="/" className="focus-ring touch-target-44 inline-flex items-center gap-2 rounded-sm">
          <Logo
            width={104}
            height={28}
            className="brightness-110 drop-shadow-[0_1px_8px_rgba(255,255,255,0.08)]"
          />
        </Link>

        <div className="flex items-center gap-3 sm:gap-4">
          <Link
            href="/browse"
            className="focus-ring touch-target-44 hidden rounded-sm text-sm font-medium text-muted-foreground transition-colors hover:text-foreground sm:inline-flex"
          >
            Browse
          </Link>
          <Link
            href="/login"
            className="focus-ring touch-target-44 inline-flex items-center rounded-full border border-white/[0.08] bg-white/[0.02] px-3 py-1.5 text-xs font-semibold text-foreground transition-all duration-300 hover:-translate-y-0.5 hover:border-white/20 hover:bg-white/[0.06] hover:shadow-[0_10px_24px_-16px_rgba(255,255,255,0.5)] sm:px-4 sm:py-2 sm:text-sm"
          >
            Sign In
          </Link>
        </div>
      </div>
    </header>
  );
}

export function HeroSection() {
  const sectionRef = useRef<HTMLElement>(null);
  const pointerFrameRef = useRef<number | null>(null);
  const scrollFrameRef = useRef<number | null>(null);

  useEffect(() => {
    const section = sectionRef.current;
    if (!section || typeof window.matchMedia !== "function") return;

    const reducedMotionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");

    const updateScrollTransition = () => {
      if (scrollFrameRef.current !== null) return;

      scrollFrameRef.current = window.requestAnimationFrame(() => {
        scrollFrameRef.current = null;

        if (reducedMotionQuery.matches) {
          section.style.setProperty("--hero-scroll-offset", "0px");
          section.style.setProperty("--hero-scroll-opacity", "1");
          return;
        }

        const transitionDistance = Math.max(window.innerHeight * 0.42, 240);
        const progress = Math.min(Math.max(window.scrollY / transitionDistance, 0), 1);
        section.style.setProperty("--hero-scroll-offset", `${progress * -12}px`);
        section.style.setProperty("--hero-scroll-opacity", `${1 - progress * 0.12}`);
      });
    };

    const syncMotionPreference = () => {
      if (reducedMotionQuery.matches) {
        delete section.dataset.pointerActive;
      }

      updateScrollTransition();
    };

    updateScrollTransition();
    window.addEventListener("scroll", updateScrollTransition, { passive: true });
    reducedMotionQuery.addEventListener("change", syncMotionPreference);

    return () => {
      window.removeEventListener("scroll", updateScrollTransition);
      reducedMotionQuery.removeEventListener("change", syncMotionPreference);

      if (pointerFrameRef.current !== null) {
        window.cancelAnimationFrame(pointerFrameRef.current);
      }
      if (scrollFrameRef.current !== null) {
        window.cancelAnimationFrame(scrollFrameRef.current);
      }
    };
  }, []);

  function handlePointerMove(event: ReactPointerEvent<HTMLElement>) {
    const section = sectionRef.current;
    if (!section || typeof window.matchMedia !== "function") return;

    const hasFinePointer = window.matchMedia("(hover: hover) and (pointer: fine)").matches;
    const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (!hasFinePointer || prefersReducedMotion) return;

    const { clientX, clientY } = event;

    if (pointerFrameRef.current !== null) {
      window.cancelAnimationFrame(pointerFrameRef.current);
    }

    pointerFrameRef.current = window.requestAnimationFrame(() => {
      pointerFrameRef.current = null;
      const rect = section.getBoundingClientRect();
      section.style.setProperty("--hero-pointer-x", `${clientX - rect.left}px`);
      section.style.setProperty("--hero-pointer-y", `${clientY - rect.top}px`);
      section.dataset.pointerActive = "true";
    });
  }

  function handlePointerLeave() {
    if (sectionRef.current) {
      delete sectionRef.current.dataset.pointerActive;
    }
  }

  return (
    <section
      ref={sectionRef}
      className="landing-hero-section relative flex min-h-[calc(100svh-4rem)] items-center overflow-hidden"
      onPointerMove={handlePointerMove}
      onPointerLeave={handlePointerLeave}
    >
      <div aria-hidden="true" className="landing-hero-pointer-glow pointer-events-none absolute inset-0 z-[1]" />
      <div className="landing-hero-motion-content relative z-10 mx-auto w-full max-w-7xl px-4 py-16 text-center min-[360px]:px-6 sm:py-20 lg:px-8">
        <h1
          className="landing-hero-reveal mx-auto max-w-5xl font-serif text-[clamp(1.3rem,6.55vw,3.4rem)] font-normal leading-[1.08] tracking-[-0.045em] text-white sm:leading-[1.05] lg:text-[4.65rem]"
          style={heroRevealStyle("80ms")}
        >
          Discover the ideas you didn’t
          <br />{" "}
          know you{" "}
          <span className="landing-hero-emphasis">needed.</span>
        </h1>

        <p
          className="landing-hero-reveal landing-hero-copy mx-auto mt-8 max-w-xl text-[0.9375rem] leading-7 text-zinc-300 max-[359px]:-mx-2 min-[360px]:text-base sm:mt-9 sm:text-lg sm:leading-8"
          style={heroRevealStyle("260ms")}
        >
          Turn books, podcasts, articles,
          <br className="sm:hidden" />{" "}
          and videos
          <br className="hidden sm:block" />{" "}
          into knowledge that compounds.
        </p>

        <div
          className="landing-hero-reveal mt-6 flex flex-wrap items-center justify-center gap-x-3 gap-y-2 sm:mt-7 sm:gap-x-4"
          style={heroRevealStyle("560ms")}
        >
          <Link href="/browse" className={PRIMARY_CTA_CLASS}>
            <span className="relative z-10">Explore a Summary</span>
            <ArrowRight className="landing-hero-cta-arrow relative z-10 size-4" />
          </Link>
          <Link href="/login" className={SECONDARY_CTA_CLASS}>
            Build Your Library Free
          </Link>
        </div>
      </div>
    </section>
  );
}
