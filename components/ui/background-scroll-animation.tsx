"use client";

import type { ReactNode } from "react";
import { useEffect, useRef, useState } from "react";
import {
  motion,
  useReducedMotion,
  useScroll,
  useTransform,
} from "framer-motion";
import { cn } from "@/lib/utils";

interface BackgroundScrollProps {
  foreground: ReactNode;
  children: ReactNode;
  className?: string;
}

export function BackgroundScroll({
  foreground,
  children,
  className,
}: BackgroundScrollProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [isMobile, setIsMobile] = useState(false);
  const prefersReducedMotion = useReducedMotion();
  const { scrollYProgress } = useScroll({
    target: containerRef,
    offset: ["start start", "end end"],
  });

  useEffect(() => {
    const mobileQuery = window.matchMedia("(max-width: 767px)");
    const syncViewport = () => setIsMobile(mobileQuery.matches);

    syncViewport();
    mobileQuery.addEventListener("change", syncViewport);
    return () => mobileQuery.removeEventListener("change", syncViewport);
  }, []);

  const reduceMotion = Boolean(prefersReducedMotion);
  const backgroundY = useTransform(
    scrollYProgress,
    [0, 1],
    reduceMotion
      ? ["0%", "0%"]
      : isMobile
        ? ["1%", "-1%"]
        : ["2%", "-2%"]
  );
  const backgroundScale = useTransform(
    scrollYProgress,
    [0, 1],
    reduceMotion ? [1.01, 1.01] : isMobile ? [1.03, 1.01] : [1.04, 1.01]
  );
  const backgroundOpacity = useTransform(
    scrollYProgress,
    [0, 0.4, 0.7, 1],
    reduceMotion
      ? [0.36, 0.36, 0.36, 0.36]
      : isMobile
        ? [0.28, 0.32, 0.36, 0.2]
        : [0.32, 0.38, 0.44, 0.2]
  );
  const foregroundY = useTransform(
    scrollYProgress,
    [0, 0.7, 1],
    reduceMotion ? [0, 0, 0] : isMobile ? [0, 0, -12] : [0, 0, -24]
  );
  const foregroundOpacity = useTransform(
    scrollYProgress,
    [0, 0.7, 1],
    reduceMotion ? [1, 1, 1] : isMobile ? [1, 1, 0.3] : [1, 1, 0.2]
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

        <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(180deg,rgba(4,4,5,0.78)_0%,rgba(4,4,5,0.38)_42%,rgba(4,4,5,0.7)_100%)]" />
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_35%,transparent_0%,rgba(4,4,5,0.24)_50%,rgba(4,4,5,0.74)_100%)]" />

        <motion.div
          style={{ translateY: foregroundY, opacity: foregroundOpacity }}
          className="relative z-10 mx-auto flex min-h-[calc(100svh-4rem)] w-full max-w-4xl items-center justify-center px-6 py-14 text-center lg:px-8"
        >
          <div className="w-full">{foreground}</div>
        </motion.div>
      </div>
    </div>
  );
}
