import { useMediaQuery } from "@/hooks/useMediaQuery";

const REDUCED_MOTION_QUERY = "(prefers-reduced-motion: reduce)";

export function usePrefersReducedMotion(): boolean {
    return useMediaQuery(REDUCED_MOTION_QUERY);
}
