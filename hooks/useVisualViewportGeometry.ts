"use client";

import { useEffect, useState } from "react";

export interface VisualViewportGeometry {
    bottomInset: number;
    height: number | null;
    offsetTop: number;
}

const DEFAULT_GEOMETRY: VisualViewportGeometry = {
    bottomInset: 0,
    height: null,
    offsetTop: 0,
};

function isSameGeometry(
    current: VisualViewportGeometry,
    next: VisualViewportGeometry,
) {
    return (
        current.bottomInset === next.bottomInset
        && current.height === next.height
        && current.offsetTop === next.offsetTop
    );
}

export function useVisualViewportGeometry() {
    const [geometry, setGeometry] = useState<VisualViewportGeometry>(DEFAULT_GEOMETRY);

    useEffect(() => {
        const visualViewport = window.visualViewport;

        if (!visualViewport) {
            return;
        }

        let animationFrame: number | null = null;

        const updateGeometry = () => {
            animationFrame = null;

            // Ignore pinch-zoom geometry. Fixed reader surfaces should retain
            // their normal page scale while the user intentionally zooms.
            const nextGeometry = Math.abs(visualViewport.scale - 1) > 0.01
                ? DEFAULT_GEOMETRY
                : {
                    bottomInset: Math.max(
                        0,
                        Math.ceil(
                            Math.max(window.innerHeight, document.documentElement.clientHeight)
                            - (visualViewport.offsetTop + visualViewport.height),
                        ),
                    ),
                    height: Math.ceil(visualViewport.height),
                    offsetTop: Math.max(0, Math.floor(visualViewport.offsetTop)),
                };

            setGeometry((currentGeometry) =>
                isSameGeometry(currentGeometry, nextGeometry)
                    ? currentGeometry
                    : nextGeometry
            );
        };

        const scheduleUpdate = () => {
            if (animationFrame !== null) {
                return;
            }

            animationFrame = window.requestAnimationFrame(updateGeometry);
        };

        updateGeometry();
        visualViewport.addEventListener("resize", scheduleUpdate);
        visualViewport.addEventListener("scroll", scheduleUpdate, { passive: true });
        window.addEventListener("resize", scheduleUpdate);
        window.addEventListener("orientationchange", scheduleUpdate);

        return () => {
            if (animationFrame !== null) {
                window.cancelAnimationFrame(animationFrame);
            }
            visualViewport.removeEventListener("resize", scheduleUpdate);
            visualViewport.removeEventListener("scroll", scheduleUpdate);
            window.removeEventListener("resize", scheduleUpdate);
            window.removeEventListener("orientationchange", scheduleUpdate);
        };
    }, []);

    return geometry;
}
