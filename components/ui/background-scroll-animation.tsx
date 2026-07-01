"use client";

import type { ReactNode } from "react";
import { useRef } from "react";
import {
  motion,
  useReducedMotion,
  useScroll,
  useTransform,
} from "framer-motion";
import { cn } from "@/lib/utils";
import { useMediaQuery } from "@/hooks/useMediaQuery";
import { VIEWPORT_QUERIES } from "@/lib/breakpoints";

interface BackgroundScrollProps {
  foreground: ReactNode;
  children: ReactNode;
  className?: string;
  foregroundClassName?: string;
}

export function BackgroundScroll({
  foreground,
  children,
  className,
  foregroundClassName,
}: BackgroundScrollProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const isLandingMobileMotion = useMediaQuery(VIEWPORT_QUERIES.landingMobileMotion);
  const prefersReducedMotion = useReducedMotion();
  const { scrollYProgress } = useScroll({
    target: containerRef,
    offset: ["start start", "end end"],
  });

  const reduceMotion = Boolean(prefersReducedMotion);
  const backgroundY = useTransform(
    scrollYProgress,
    [0, 1],
    reduceMotion
      ? ["0%", "0%"]
      : isLandingMobileMotion
        ? ["1%", "-1%"]
        : ["2%", "-2%"]
  );
  const backgroundScale = useTransform(
    scrollYProgress,
    [0, 1],
    reduceMotion ? [1.01, 1.01] : isLandingMobileMotion ? [1.03, 1.01] : [1.04, 1.01]
  );
  const backgroundOpacity = useTransform(
    scrollYProgress,
    [0, 0.4, 0.7, 1],
    reduceMotion
      ? [0.44, 0.44, 0.44, 0.44]
      : isLandingMobileMotion
        ? [0.34, 0.38, 0.42, 0.24]
        : [0.42, 0.46, 0.52, 0.28]
  );
  const backgroundFocusOpacity = useTransform(
    scrollYProgress,
    [0, 0.62, 1],
    reduceMotion ? [0, 0, 0] : isLandingMobileMotion ? [0, 0.04, 0.16] : [0, 0.05, 0.2]
  );

  return (
    <div
      ref={containerRef}
      className={cn(
        reduceMotion
          ? "relative min-h-[calc(100svh-4rem)] w-full"
          : "relative h-[115svh] w-full md:h-[150svh]",
        className
      )}
    >
      <div
        className={cn(
          "relative w-full overflow-hidden",
          reduceMotion
            ? "min-h-[calc(100svh-4rem)]"
            : "sticky top-16 h-[calc(100svh-4rem)]"
        )}
      >
        <motion.div
          aria-hidden="true"
          style={{
            translateY: backgroundY,
            scale: backgroundScale,
            opacity: backgroundOpacity,
          }}
          className="absolute -inset-[8%] origin-center"
        >
          {children}
        </motion.div>

        <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(180deg,rgba(4,4,5,0.7)_0%,rgba(4,4,5,0.3)_42%,rgba(4,4,5,0.62)_100%)]" />
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_35%,transparent_0%,rgba(4,4,5,0.16)_50%,rgba(4,4,5,0.62)_100%)]" />
        <motion.div
          aria-hidden="true"
          style={{ opacity: backgroundFocusOpacity }}
          className="pointer-events-none absolute inset-0 bg-black"
        />

        <motion.div
          className={cn(
            "relative z-10 mx-auto flex min-h-[calc(100svh-4rem)] w-full max-w-4xl items-center justify-center px-6 py-14 text-center lg:px-8",
            foregroundClassName
          )}
        >
          <div className="w-full">{foreground}</div>
        </motion.div>
      </div>
    </div>
  );
}
