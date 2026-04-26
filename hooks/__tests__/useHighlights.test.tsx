// @vitest-environment jsdom
import type { ReactNode } from "react";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useHighlights } from "@/hooks/useHighlights";

function createWrapper() {
    const queryClient = new QueryClient({
        defaultOptions: {
            queries: {
                retry: false,
                refetchOnWindowFocus: false,
            },
        },
    });

    return function Wrapper({ children }: { children: ReactNode }) {
        return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
    };
}

describe("useHighlights", () => {
    const fetchMock = vi.fn();

    beforeEach(() => {
        fetchMock.mockReset();
        fetchMock.mockResolvedValue({
            ok: true,
            json: async () => ({ data: [] }),
        });
        vi.stubGlobal("fetch", fetchMock);
    });

    it("includes content item and limit query params when provided", async () => {
        renderHook(() => useHighlights("content-1", { limit: 50 }), {
            wrapper: createWrapper(),
        });

        await waitFor(() => {
            expect(fetchMock).toHaveBeenCalledTimes(1);
        });

        const requestUrl = new URL(String(fetchMock.mock.calls[0]?.[0] ?? ""), "http://localhost");
        expect(requestUrl.pathname).toBe("/api/library/highlights");
        expect(requestUrl.searchParams.get("content_item_id")).toBe("content-1");
        expect(requestUrl.searchParams.get("limit")).toBe("50");
    });
});
