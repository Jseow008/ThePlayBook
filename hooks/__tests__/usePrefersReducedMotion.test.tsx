import { renderHook, waitFor } from "@testing-library/react";
import { usePrefersReducedMotion } from "@/hooks/usePrefersReducedMotion";

describe("usePrefersReducedMotion", () => {
    it("uses the reduced motion media query", async () => {
        window.matchMedia = vi.fn((query: string) => ({
            matches: query === "(prefers-reduced-motion: reduce)",
            media: query,
            onchange: null,
            addEventListener: vi.fn(),
            removeEventListener: vi.fn(),
            addListener: vi.fn(),
            removeListener: vi.fn(),
            dispatchEvent: vi.fn(),
        }));

        const { result } = renderHook(() => usePrefersReducedMotion());

        await waitFor(() => {
            expect(result.current).toBe(true);
        });
        expect(window.matchMedia).toHaveBeenCalledWith("(prefers-reduced-motion: reduce)");
    });
});
