// @vitest-environment jsdom
import type { ReactNode } from "react";
import { act, renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
    HighlightConflictError,
    useCreateHighlight,
    useHighlights,
    useInfiniteHighlights,
    type HighlightsPage,
} from "@/hooks/useHighlights";

const { mockUser, mockSessionIdentity } = vi.hoisted(() => ({ mockUser: vi.fn(), mockSessionIdentity: vi.fn() }));
vi.mock("@/hooks/useAuthUser", () => ({
    useAuthUser: mockUser,
    useAuthSessionIdentity: mockSessionIdentity,
}));

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
        mockUser.mockReturnValue({ id: "user-1" });
        mockSessionIdentity.mockReturnValue({ user: { id: "user-1" }, sessionEpoch: 0 });
        fetchMock.mockReset();
        fetchMock.mockResolvedValue({
            ok: true,
            json: async () => ({ data: [] }),
        });
        vi.stubGlobal("fetch", fetchMock);
    });

    it("does not request highlights for a guest or unresolved session", () => {
        mockUser.mockReturnValue(undefined);
        const { rerender } = renderHook(() => useHighlights("content-1"), { wrapper: createWrapper() });
        mockUser.mockReturnValue(null);
        rerender();
        expect(fetchMock).not.toHaveBeenCalled();
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

    it("aborts and discards an in-flight page when the authenticated account changes", async () => {
        const pageFor = (id: string): HighlightsPage => ({
            data: [{
                id,
                user_id: id === "highlight-a" ? "user-1" : "user-2",
                content_item_id: "content-1",
                segment_id: null,
                anchor_start: null,
                anchor_end: null,
                highlighted_text: `Highlight ${id}`,
                note_body: null,
                color: "yellow",
                created_at: "2026-09-18T00:00:00.000Z",
                updated_at: null,
                content_item: null,
                segment: null,
            }],
            nextCursor: null,
        });
        let resolveFirstResponse: ((value: { ok: boolean; json: () => Promise<HighlightsPage> }) => void) | undefined;
        let firstSignal: AbortSignal | undefined;
        fetchMock
            .mockImplementationOnce((_url: string, init?: RequestInit) => new Promise((resolve) => {
                firstSignal = init?.signal ?? undefined;
                resolveFirstResponse = resolve;
            }))
            .mockResolvedValueOnce({
                ok: true,
                json: async () => pageFor("highlight-b"),
            });

        const { result, rerender } = renderHook(() => useInfiniteHighlights(), { wrapper: createWrapper() });
        await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));

        mockSessionIdentity.mockReturnValue({ user: { id: "user-2" }, sessionEpoch: 1 });
        rerender();

        await waitFor(() => expect(firstSignal?.aborted).toBe(true));
        resolveFirstResponse?.({
            ok: true,
            json: async () => pageFor("highlight-a"),
        });

        await waitFor(() => {
            expect(fetchMock).toHaveBeenCalledTimes(2);
            expect(result.current.data?.pages[0]?.data.map((highlight) => highlight.id)).toEqual(["highlight-b"]);
        });
        expect(result.current.data?.pages.flatMap((page) => page.data).map((highlight) => highlight.id)).not.toContain("highlight-a");
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
