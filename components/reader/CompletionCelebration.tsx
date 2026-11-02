"use client";

import { useEffect, useRef } from "react";

interface CompletionCelebrationProps {
    requested: boolean;
    onConsumed: () => void;
}

export function CompletionCelebration({ requested, onConsumed }: CompletionCelebrationProps) {
    const layerRef = useRef<HTMLSpanElement>(null);

    useEffect(() => {
        const layer = layerRef.current;
        const heading = layer?.parentElement;
        if (!requested || !layer || !heading) return;
        const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
        const animations: Animation[] = [];
        let timer: number | undefined;
        let visible = false;
        let started = false;
        let cancelled = false;
        let consumed = false;
        const consume = () => {
            if (cancelled || consumed) return;
            consumed = true;
            animations.forEach(animation => animation.cancel());
            onConsumed();
        };
        const start = () => {
            if (cancelled || consumed || started || !visible || document.visibilityState === "hidden") return;
            started = true;
            if (reducedMotion.matches || typeof layer.animate !== "function") {
                consume();
                return;
            }
            // One desktop trajectory, uniformly scaled to the available width.
            const scale = Math.min(1, layer.clientWidth / 480);
            Array.from(layer.children).forEach((child, index) => {
                const side = index < 12 ? 1 : -1;
                const part = index % 12;
                const x = side * 72 * (.3 + (part % 5) * .15) * scale;
                const rise = (90 + (part * 17) % 100) * scale;
                const rotation = (90 + part * 31) * side;
                animations.push(child.animate([
                    { opacity: 0, transform: "translate(0, 0) rotate(0deg)", offset: 0 },
                    { opacity: .9, offset: .12 },
                    { opacity: .8, transform: `translate(${x}px, ${-rise}px) rotate(${rotation}deg)`, offset: .6 },
                    { opacity: 0, transform: `translate(${x}px, ${-.65 * rise}px) rotate(${rotation}deg)`, offset: 1 },
                ], { duration: 800, delay: (part % 3) * 12, easing: "cubic-bezier(.15,.6,.35,1)" }));
            });
            timer = window.setTimeout(consume, 850);
        };
        const onMotionChange = () => { if (reducedMotion.matches) consume(); };
        if (reducedMotion.matches || typeof IntersectionObserver === "undefined") {
            consume();
            return;
        }
        const observer = new IntersectionObserver(([entry]) => {
            visible = entry.isIntersecting && entry.intersectionRatio >= 1;
            start();
        }, { threshold: 1 });
        observer.observe(heading.querySelector("h2") ?? heading);
        document.addEventListener("visibilitychange", start);
        reducedMotion.addEventListener("change", onMotionChange);
        return () => {
            cancelled = true;
            observer.disconnect();
            document.removeEventListener("visibilitychange", start);
            reducedMotion.removeEventListener("change", onMotionChange);
            window.clearTimeout(timer);
            animations.forEach(animation => animation.cancel());
        };
    }, [requested, onConsumed]);

    if (!requested) return null;
    return (
        <span ref={layerRef} className={"reader-completion-burst"} aria-hidden="true">
            {Array.from({ length: 24 }, (_, index) => {
                const part = index % 12;
                return <span key={index} className={[
                    "reader-completion-particle", index < 12 ? "reader-completion-left" : "reader-completion-right",
                    part % 3 === 0 ? "reader-completion-gold" : "", part % 4 === 0 ? "reader-completion-dot" : "",
                ].join(" ")} />;
            })}
        </span>
    );
}
