// @vitest-environment jsdom
import type { ReactNode } from "react";
import { act, renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
    HighlightConflictError,
    useCreateHighlight,
    useHighlights,
} from "@/hooks/useHighlights";

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

    it("returns an existing disposition for an exact duplicate", async () => {
        fetchMock.mockResolvedValueOnce({
            ok: true,
            json: async () => ({
                data: { id: "highlight-existing" },
                disposition: "existing",
            }),
        });

        const { result } = renderHook(() => useCreateHighlight(), {
            wrapper: createWrapper(),
        });

        let response: Awaited<ReturnType<typeof result.current.mutateAsync>> | undefined;
        await act(async () => {
            response = await result.current.mutateAsync({
                content_item_id: "content-1",
                segment_id: "segment-1",
                highlighted_text: "Duplicate",
                anchor_start: 0,
                anchor_end: 9,
            });
        });

        expect(response?.disposition).toBe("existing");
        expect(response?.highlight.id).toBe("highlight-existing");
    });

    it("exposes structured overlap conflicts to the reader UI", async () => {
        fetchMock.mockResolvedValueOnce({
            ok: false,
            json: async () => ({
                error: {
                    code: "CONFLICT",
                    message: "This selection overlaps an existing highlight.",
                    details: {
                        existing_highlight_id: "highlight-existing",
                        relationship: "contained",
                    },
                },
            }),
        });

        const { result } = renderHook(() => useCreateHighlight(), {
            wrapper: createWrapper(),
        });

        let caught: unknown;
        await act(async () => {
            try {
                await result.current.mutateAsync({
                    content_item_id: "content-1",
                    segment_id: "segment-1",
                    highlighted_text: "Nested",
                    anchor_start: 4,
                    anchor_end: 10,
                });
            } catch (error) {
                caught = error;
            }
        });

        expect(caught).toBeInstanceOf(HighlightConflictError);
        expect((caught as HighlightConflictError).details).toEqual({
            existingHighlightId: "highlight-existing",
            relationship: "contained",
        });
    });
});
