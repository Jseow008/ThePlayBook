import { useQuery, useMutation, useQueryClient, useInfiniteQuery } from "@tanstack/react-query";
import type { UserHighlight } from "@/types/database";

// Type for the API response which includes joined content item data
export type HighlightWithContent = UserHighlight & {
    content_item: {
        id: string;
        title: string;
        author: string | null;
        cover_image_url: string | null;
    } | null;
};

interface UseHighlightsOptions {
    initialData?: HighlightWithContent[];
}

// ----------------------------------------------------------------------------
// Fetch Highlights
// ----------------------------------------------------------------------------
export function useHighlights(contentItemId?: string, options?: UseHighlightsOptions) {
    return useQuery({
        queryKey: ["highlights", contentItemId],
        queryFn: async (): Promise<HighlightWithContent[]> => {
            const url = contentItemId
                ? `/api/library/highlights?content_item_id=${contentItemId}`
                : "/api/library/highlights";

            const res = await fetch(url);
            if (!res.ok) {
                if (res.status === 401) return []; // Not logged in
                throw new Error("Failed to fetch highlights");
            }

            const { data } = await res.json();
            return data as HighlightWithContent[];
        },
        initialData: options?.initialData,
    });
}

// ----------------------------------------------------------------------------
// Fetch Infinite Highlights
// ----------------------------------------------------------------------------
export function useInfiniteHighlights(contentItemId?: string) {
    return useInfiniteQuery({
        queryKey: ["highlights", "infinite", contentItemId],
        queryFn: async ({ pageParam }: { pageParam: string | null }): Promise<{ data: HighlightWithContent[], nextCursor: string | null }> => {
            let url = contentItemId
                ? `/api/library/highlights?content_item_id=${contentItemId}&limit=30`
                : "/api/library/highlights?limit=30";

            if (pageParam) {
                url += `&cursor=${encodeURIComponent(pageParam)}`;
            }

            const res = await fetch(url);
            if (!res.ok) {
                if (res.status === 401) return { data: [], nextCursor: null }; // Not logged in
                throw new Error("Failed to fetch highlights");
            }

            return await res.json();
        },
        initialPageParam: null as string | null,
        getNextPageParam: (lastPage) => lastPage.nextCursor,
    });
}

// ----------------------------------------------------------------------------
// Create Highlight
// ----------------------------------------------------------------------------
interface CreateHighlightArgs {
    content_item_id: string;
    segment_id?: string;
    highlighted_text: string;
    note_body?: string;
    color?: string;
    anchor_start?: number;
    anchor_end?: number;
}

export function useCreateHighlight() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: async (args: CreateHighlightArgs) => {
            const res = await fetch("/api/library/highlights", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(args),
            });

            if (!res.ok) {
                const errorData = await res.json().catch(() => ({}));
                throw new Error(errorData?.error?.message || "Failed to create highlight");
            }

            const { data } = await res.json();
            return data as UserHighlight;
        },
        onMutate: async (newArgs) => {
            await queryClient.cancelQueries({ queryKey: ["highlights"] });

            const previousData = queryClient.getQueriesData({ queryKey: ["highlights"] });

            // Create a temporary optimistic highlight
            const optimisticHighlight: HighlightWithContent = {
                id: `temp-${Date.now()}`,
                user_id: "",
                content_item_id: newArgs.content_item_id,
                segment_id: newArgs.segment_id || null,
                highlighted_text: newArgs.highlighted_text,
                note_body: newArgs.note_body || null,
                color: newArgs.color || (newArgs.note_body ? "blue" : "yellow"),
                anchor_start: newArgs.anchor_start ?? null,
                anchor_end: newArgs.anchor_end ?? null,
                created_at: new Date().toISOString(),
                updated_at: null,
                content_item: null,
            };

            previousData.forEach(([queryKey, oldData]) => {
                if (!Array.isArray(oldData)) return;

                const queryContentId = queryKey[1];
                if (queryContentId !== undefined && queryContentId !== newArgs.content_item_id) {
                    return;
                }

                queryClient.setQueryData<HighlightWithContent[]>(
                    queryKey,
                    [optimisticHighlight, ...oldData]
                );
            });

            return { previousData };
        },
        onError: (_err, _newArgs, context) => {
            if (!context?.previousData) return;

            context.previousData.forEach(([queryKey, data]) => {
                queryClient.setQueryData(queryKey, data);
            });
        },
        onSettled: () => {
            queryClient.invalidateQueries({ queryKey: ["highlights"] });
        },
    });
}

// ----------------------------------------------------------------------------
// Delete Highlight
// ----------------------------------------------------------------------------
export function useDeleteHighlight() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: async (id: string) => {
            const res = await fetch(`/api/library/highlights/${id}`, {
                method: "DELETE",
            });

            if (!res.ok) {
                throw new Error("Failed to delete highlight");
            }

            return id;
        },
        onMutate: async (deletedId) => {
            // Cancel any in-flight refetches so they don't overwrite our optimistic update
            await queryClient.cancelQueries({ queryKey: ["highlights"] });

            // Snapshot current cache for rollback
            const previousData = queryClient.getQueriesData({ queryKey: ["highlights"] });

            // Optimistically remove the highlight from ALL explicitly matched queries
            previousData.forEach(([queryKey, oldData]) => {
                if (Array.isArray(oldData)) {
                    queryClient.setQueryData(
                        queryKey,
                        oldData.filter((h: HighlightWithContent) => h.id !== deletedId)
                    );
                } else if (oldData && typeof oldData === "object" && "pages" in oldData) {
                    const infiniteData = oldData as { pages: { data: HighlightWithContent[]; nextCursor: string | null }[]; pageParams: unknown[] };
                    queryClient.setQueryData(
                        queryKey,
                        {
                            ...infiniteData,
                            pages: infiniteData.pages.map(page => ({
                                ...page,
                                data: page.data.filter((h: HighlightWithContent) => h.id !== deletedId)
                            }))
                        }
                    );
                }
            });

            return { previousData };
        },
        onError: (_err, _deletedId, context) => {
            // Rollback to previous cache on failure
            if (context?.previousData) {
                context.previousData.forEach(([queryKey, data]) => {
                    queryClient.setQueryData(queryKey, data);
                });
            }
        },
        onSettled: () => {
            // Always refetch after mutation to ensure server consistency
            queryClient.invalidateQueries({ queryKey: ["highlights"] });
        },
    });
}

// ----------------------------------------------------------------------------
// Update Highlight
// ----------------------------------------------------------------------------
interface UpdateHighlightArgs {
    id: string;
    note_body?: string | null;
    color?: string;
}

export function useUpdateHighlight() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: async (args: UpdateHighlightArgs) => {
            const res = await fetch(`/api/library/highlights/${args.id}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    note_body: args.note_body,
                    color: args.color,
                }),
            });

            if (!res.ok) {
                const errorData = await res.json().catch(() => ({}));
                throw new Error(errorData?.error?.message || "Failed to update highlight");
            }

            const { data } = await res.json();
            return data as UserHighlight;
        },
        onMutate: async (updatedArgs) => {
            // Cancel any in-flight refetches
            await queryClient.cancelQueries({ queryKey: ["highlights"] });

            // Snapshot current cache for rollback
            const previousData = queryClient.getQueriesData({ queryKey: ["highlights"] });

            // Optimistically update the highlight across ALL matches
            previousData.forEach(([queryKey, oldData]) => {
                const mapHighlight = (h: HighlightWithContent) => {
                    if (h.id === updatedArgs.id) {
                        return {
                            ...h,
                            note_body: updatedArgs.note_body !== undefined ? updatedArgs.note_body : h.note_body,
                            color: updatedArgs.color !== undefined ? updatedArgs.color : h.color,
                            updated_at: new Date().toISOString(),
                        };
                    }
                    return h;
                };

                if (Array.isArray(oldData)) {
                    queryClient.setQueryData(
                        queryKey,
                        oldData.map(mapHighlight)
                    );
                } else if (oldData && typeof oldData === "object" && "pages" in oldData) {
                    const infiniteData = oldData as { pages: { data: HighlightWithContent[]; nextCursor: string | null }[]; pageParams: unknown[] };
                    queryClient.setQueryData(
                        queryKey,
                        {
                            ...infiniteData,
                            pages: infiniteData.pages.map(page => ({
                                ...page,
                                data: page.data.map(mapHighlight)
                            }))
                        }
                    );
                }
            });

            return { previousData };
        },
        onError: (_err, _updatedArgs, context) => {
            // Rollback to previous cache on failure
            if (context?.previousData) {
                context.previousData.forEach(([queryKey, data]) => {
                    queryClient.setQueryData(queryKey, data);
                });
            }
        },
        onSettled: () => {
            // Always refetch after mutation to ensure server consistency
            queryClient.invalidateQueries({ queryKey: ["highlights"] });
        },
    });
}
