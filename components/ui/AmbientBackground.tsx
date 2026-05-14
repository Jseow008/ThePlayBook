"use client";

import { usePathname } from "next/navigation";

const AMBIENT_BACKGROUND_PATHS = new Set(["/"]);

const AMBIENT_NOISE_STYLE = {
    backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noiseFilter'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.65' numOctaves='2' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noiseFilter)'/%3E%3C/svg%3E")`,
} as const;

const AMBIENT_LIGHT_STYLE = {
    background: [
        "radial-gradient(ellipse 760px 520px at 50% -14%, hsl(var(--primary) / 0.08) 0%, hsl(var(--primary) / 0.035) 36%, transparent 72%)",
        "linear-gradient(to bottom, hsl(var(--primary) / 0.035), transparent 430px)",
    ].join(", "),
} as const;

function shouldRenderAmbientBackground(pathname: string | null) {
    return Boolean(pathname && AMBIENT_BACKGROUND_PATHS.has(pathname));
}

export function AmbientBackground() {
    const pathname = usePathname();

    if (!shouldRenderAmbientBackground(pathname)) {
        return null;
    }

    return (
        <div
            aria-hidden="true"
            data-netflux-ambient-background
            className="pointer-events-none fixed inset-0 z-[-1] overflow-hidden bg-background"
        >
            <div className="absolute inset-x-0 top-0 h-[560px] opacity-80" style={AMBIENT_LIGHT_STYLE} />
            <div className="absolute inset-0 hidden opacity-[0.018] sm:block" style={AMBIENT_NOISE_STYLE} />
        </div>
    );
}
