import { act, renderHook, waitFor } from "@testing-library/react";
import { useMediaQuery } from "@/hooks/useMediaQuery";

function createModernMediaQueryList(initialMatches: boolean) {
    const listeners = new Set<() => void>();
    const mediaQueryList = {
        matches: initialMatches,
        media: "",
        onchange: null,
        addEventListener: vi.fn((_event: string, listener: () => void) => {
            listeners.add(listener);
        }),
        removeEventListener: vi.fn((_event: string, listener: () => void) => {
            listeners.delete(listener);
        }),
        addListener: vi.fn(),
        removeListener: vi.fn(),
        dispatchEvent: vi.fn(),
        setMatches(nextMatches: boolean) {
            mediaQueryList.matches = nextMatches;
            listeners.forEach((listener) => listener());
        },
    };

    return mediaQueryList;
}

function createLegacyMediaQueryList(initialMatches: boolean) {
    const listeners = new Set<() => void>();
    const mediaQueryList = {
        matches: initialMatches,
        media: "",
        onchange: null,
        addEventListener: undefined,
        removeEventListener: undefined,
        addListener: vi.fn((listener: () => void) => {
            listeners.add(listener);
        }),
        removeListener: vi.fn((listener: () => void) => {
            listeners.delete(listener);
        }),
        dispatchEvent: vi.fn(),
        setMatches(nextMatches: boolean) {
            mediaQueryList.matches = nextMatches;
            listeners.forEach((listener) => listener());
        },
    };

    return mediaQueryList;
}

describe("useMediaQuery", () => {
    it("syncs the match state after mount", async () => {
        const media = createModernMediaQueryList(true);
        window.matchMedia = vi.fn(() => media as unknown as MediaQueryList);

        const { result } = renderHook(() => useMediaQuery("(min-width: 768px)"));

        await waitFor(() => {
            expect(result.current).toBe(true);
        });
        expect(window.matchMedia).toHaveBeenCalledWith("(min-width: 768px)");
    });

    it("updates when a modern media query change event fires", async () => {
        const media = createModernMediaQueryList(false);
        window.matchMedia = vi.fn(() => media as unknown as MediaQueryList);

        const { result } = renderHook(() => useMediaQuery("(min-width: 768px)"));

        expect(result.current).toBe(false);

        act(() => {
            media.setMatches(true);
        });

        await waitFor(() => {
            expect(result.current).toBe(true);
        });
        expect(media.addEventListener).toHaveBeenCalledWith("change", expect.any(Function));
    });

    it("cleans up modern listeners on unmount", () => {
        const media = createModernMediaQueryList(false);
        window.matchMedia = vi.fn(() => media as unknown as MediaQueryList);

        const { unmount } = renderHook(() => useMediaQuery("(min-width: 768px)"));
        unmount();

        expect(media.removeEventListener).toHaveBeenCalledWith("change", expect.any(Function));
    });

    it("falls back to legacy addListener and removeListener", () => {
        const media = createLegacyMediaQueryList(false);
        window.matchMedia = vi.fn(() => media as unknown as MediaQueryList);

        const { unmount } = renderHook(() => useMediaQuery("(min-width: 768px)"));

        expect(media.addListener).toHaveBeenCalledWith(expect.any(Function));
        unmount();
        expect(media.removeListener).toHaveBeenCalledWith(expect.any(Function));
    });

    it("resubscribes when the query changes but not when the match state changes", async () => {
        const firstMedia = createModernMediaQueryList(false);
        const secondMedia = createModernMediaQueryList(true);
        window.matchMedia = vi
            .fn()
            .mockReturnValueOnce(firstMedia as unknown as MediaQueryList)
            .mockReturnValueOnce(secondMedia as unknown as MediaQueryList);

        const { result, rerender } = renderHook(
            ({ query }) => useMediaQuery(query),
            { initialProps: { query: "(min-width: 768px)" } }
        );

        act(() => {
            firstMedia.setMatches(true);
        });

        await waitFor(() => {
            expect(result.current).toBe(true);
        });
        expect(firstMedia.addEventListener).toHaveBeenCalledTimes(1);
        expect(window.matchMedia).toHaveBeenCalledTimes(1);

        rerender({ query: "(min-width: 1024px)" });

        await waitFor(() => {
            expect(result.current).toBe(true);
        });
        expect(firstMedia.removeEventListener).toHaveBeenCalledWith("change", expect.any(Function));
        expect(secondMedia.addEventListener).toHaveBeenCalledTimes(1);
        expect(window.matchMedia).toHaveBeenCalledTimes(2);
    });
});
