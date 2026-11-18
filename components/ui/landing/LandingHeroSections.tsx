"use client";

import type { CSSProperties, PointerEvent as ReactPointerEvent } from "react";
import { useEffect, useRef } from "react";
import Link from "next/link";
import { Logo } from "@/components/ui/Logo";

const heroRevealStyle = (delay: string) =>
  ({ "--hero-reveal-delay": delay } as CSSProperties);

export function LandingHeader() {
  return (
    <header className="landing-header sticky top-0 z-50 border-b border-white/[0.08] bg-background/95 backdrop-blur-xl">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6">
        <Link prefetch={false} href="/" className="focus-ring touch-target-44 inline-flex items-center gap-2 rounded-sm">
          <Logo
            width={104}
            height={28}
            priority
            className="brightness-110 drop-shadow-[0_1px_8px_rgba(255,255,255,0.08)]"
          />
        </Link>

        <div className="flex items-center gap-3 sm:gap-4">
          <Link prefetch={false}
            href="/browse"
            className="focus-ring touch-target-44 hidden rounded-sm text-sm font-medium text-muted-foreground transition-colors hover:text-foreground sm:inline-flex"
          >
            Browse
          </Link>
          <Link prefetch={false}
            href="/login"
            className="focus-ring touch-target-44 inline-flex min-h-11 items-center rounded-full border border-white/[0.08] bg-white/[0.02] px-4 py-2 text-sm font-semibold text-foreground transition-all duration-300 hover:-translate-y-0.5 hover:border-white/20 hover:bg-white/[0.06] hover:shadow-[0_10px_24px_-16px_rgba(255,255,255,0.5)] sm:min-h-0"
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
      className="landing-hero-section relative flex items-center overflow-hidden"
      onPointerMove={handlePointerMove}
      onPointerLeave={handlePointerLeave}
    >
      <div aria-hidden="true" className="landing-hero-pointer-glow pointer-events-none absolute inset-0 z-[1]" />
      <div className="landing-hero-motion-content relative z-10 mx-auto w-full max-w-7xl px-4 pt-8 pb-4 text-center min-[360px]:px-6 sm:pt-12 sm:pb-5 lg:px-8">
        <h1
          className="landing-hero-reveal landing-hero-title mx-auto max-w-6xl font-serif font-normal text-white"
          style={heroRevealStyle("80ms")}
        >
          Know what’s worth your time.
          <br />{" "}
          <span className="landing-hero-emphasis">Keep what’s worth remembering.</span>
        </h1>
      </div>
    </section>
  );
}
