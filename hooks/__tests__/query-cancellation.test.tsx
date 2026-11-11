import type { ReactNode } from "react";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useBatchContentItems, useBrowseRecommendations, useRecommendations } from "@/hooks/use-content-queries";
import { useHighlights } from "@/hooks/useHighlights";
import { useReflections } from "@/hooks/useReflections";

vi.mock("@/hooks/useReadingProgress", () => ({
    useReadingProgress: () => ({ storageScope: "guest" }),
}));
vi.mock("@/hooks/useAuthUser", () => ({
    useAuthUser: () => ({ id: "account-1" }),
    useAuthSessionIdentity: () => ({ user: { id: "account-1" }, sessionEpoch: 0 }),
}));

function createWrapper() {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    return function Wrapper({ children }: { children: ReactNode }) {
        return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
    };
}

const queries = [
    ["content batches", (id: string) => useBatchContentItems([id])],
    ["recommendations", (id: string) => useRecommendations([id])],
    ["browse recommendations", (id: string) => useBrowseRecommendations({
        recentSeedId: id, librarySeedIds: [], excludeIds: [],
    })],
    ["highlights", (id: string) => useHighlights(id)],
    ["reflections", (id: string) => useReflections(id)],
] as const;

describe("read cancellation", () => {
    const signals: AbortSignal[] = [];
    const fetchMock = vi.fn();

    beforeEach(() => {
        signals.length = 0;
        fetchMock.mockReset();
        fetchMock.mockImplementation((_url: unknown, init?: RequestInit) => {
            const signal = init?.signal as AbortSignal;
            signals.push(signal);
            return new Promise((_resolve, reject) => {
                signal?.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")), { once: true });
            });
        });
        vi.stubGlobal("fetch", fetchMock);
    });

    it.each(queries)("aborts obsolete %s when the key changes and the view unmounts", async (_name, useRead) => {
        const { rerender, unmount } = renderHook(({ id }) => useRead(id), {
            wrapper: createWrapper(), initialProps: { id: "first" },
        });
        await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
        expect(signals[0]).toBeInstanceOf(AbortSignal);
        expect(signals[0].aborted).toBe(false);

        rerender({ id: "second" });
        await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
        expect(signals[0].aborted).toBe(true);
        expect(signals[1].aborted).toBe(false);

        unmount();
        expect(signals[1].aborted).toBe(true);
    });

    it("cancels every chunk of an abandoned content batch", async () => {
        const ids = Array.from({ length: 55 }, (_, index) => `item-${index}`);
        const { unmount } = renderHook(() => useBatchContentItems(ids), { wrapper: createWrapper() });
        await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));

        unmount();
        expect(signals.every(signal => signal.aborted)).toBe(true);
    });

    it("keeps a shared content read alive until its last observer leaves", async () => {
        const wrapper = createWrapper();
        const first = renderHook(() => useBatchContentItems(["shared"]), { wrapper });
        const second = renderHook(() => useBatchContentItems(["shared"]), { wrapper });
        await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));

        first.unmount();
        expect(signals[0].aborted).toBe(false);
        second.unmount();
        expect(signals[0].aborted).toBe(true);
    });
});
