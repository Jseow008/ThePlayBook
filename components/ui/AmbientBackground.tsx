const AMBIENT_NOISE_STYLE = {
    backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noiseFilter'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.65' numOctaves='2' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noiseFilter)'/%3E%3C/svg%3E")`,
} as const;

const AMBIENT_LIGHT_STYLE = {
    background: [
        "radial-gradient(ellipse 820px 540px at 48% -16%, hsl(var(--primary) / 0.09) 0%, hsl(var(--primary) / 0.038) 38%, transparent 74%)",
        "radial-gradient(ellipse 620px 420px at 72% 12%, rgba(244, 192, 79, 0.085) 0%, rgba(244, 192, 79, 0.028) 42%, transparent 72%)",
        "radial-gradient(ellipse 520px 340px at 16% 20%, rgba(255, 255, 255, 0.04) 0%, transparent 64%)",
        "linear-gradient(to bottom, hsl(var(--primary) / 0.035), transparent 460px)",
    ].join(", "),
} as const;

const AMBIENT_VIGNETTE_STYLE = {
    background: [
        "linear-gradient(to bottom, transparent 0%, transparent 54%, hsl(var(--background) / 0.82) 100%)",
        "radial-gradient(ellipse at center, transparent 0%, transparent 54%, rgba(0, 0, 0, 0.48) 100%)",
    ].join(", "),
} as const;

export function AmbientBackground() {
    return (
        <div
            aria-hidden="true"
            data-netflux-ambient-background
            className="pointer-events-none fixed inset-0 z-[-1] overflow-hidden bg-background"
        >
            <div className="absolute inset-x-0 top-0 h-[640px] opacity-90" style={AMBIENT_LIGHT_STYLE} />
            <div className="absolute inset-0" style={AMBIENT_VIGNETTE_STYLE} />
            <div className="absolute inset-0 hidden opacity-[0.022] sm:block" style={AMBIENT_NOISE_STYLE} />
        </div>
    );
}
