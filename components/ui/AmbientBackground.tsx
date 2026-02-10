"use client";

import React from "react";

export function AmbientBackground() {
    return (
        <div className="pointer-events-none fixed inset-0 z-[-1] overflow-hidden">
            {/* Noise Texture */}
            <div
                className="absolute inset-0 opacity-[0.03] mix-blend-overlay"
                style={{
                    backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noiseFilter'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.65' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noiseFilter)'/%3E%3C/svg%3E")`,
                    transform: "translate3d(0, 0, 0)",
                }}
            />

            {/* Top Gradient Shade */}
            <div
                className="absolute top-0 left-0 right-0 h-[500px] bg-gradient-to-b from-primary/5 via-transparent to-transparent opacity-40"
                style={{ transform: "translate3d(0, 0, 0)" }}
            />

            {/* Radial Glow at top center */}
            <div
                className="absolute top-[-20%] left-1/2 -translate-x-1/2 w-[800px] h-[600px] rounded-full bg-primary/5 blur-3xl opacity-30"
                style={{ transform: "translate3d(-50%, 0, 0)" }}
            />
        </div>
    );
}
