import { useQuery, useMutation, useQueryClient, useInfiniteQuery } from "@tanstack/react-query";
import type { UserHighlight } from "@/types/database";
import type { HighlightRangeRelationship } from "@/lib/highlight-ranges";

// Type for the API response which includes joined content item data
export type HighlightWithContent = UserHighlight & {
    content_item: {
        id: string;
        title: string;
        author: string | null;
        cover_image_url: string | null;
    } | null;
    segment: {
        id: string;
        title: string | null;
    } | null;
};

interface UseHighlightsOptions {
    initialData?: HighlightWithContent[];
    limit?: number;
}

export interface HighlightsPage {
    data: HighlightWithContent[];
    nextCursor: string | null;
}

interface UseInfiniteHighlightsOptions {
    initialPage?: HighlightsPage;
    enabled?: boolean;
}

// ----------------------------------------------------------------------------
// Fetch Highlights
// ----------------------------------------------------------------------------
export function useHighlights(contentItemId?: string, options?: UseHighlightsOptions) {
    return useQuery({
        queryKey: ["highlights", contentItemId, options?.limit ?? null],
        queryFn: async (): Promise<HighlightWithContent[]> => {
            const params = new URLSearchParams();

            if (contentItemId) {
                params.set("content_item_id", contentItemId);
            }

            if (options?.limit) {
                params.set("limit", String(options.limit));
            }

            const queryString = params.toString();
            const url = queryString
                ? `/api/library/highlights?${queryString}`
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
export function useInfiniteHighlights(contentItemId?: string, options?: UseInfiniteHighlightsOptions) {
    return useInfiniteQuery({
        queryKey: ["highlights", "infinite", contentItemId],
        queryFn: async ({ pageParam }: { pageParam: string | null }): Promise<HighlightsPage> => {
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
        initialData: options?.initialPage
            ? {
                pages: [options.initialPage],
                pageParams: [null],
            }
            : undefined,
        enabled: options?.enabled,
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

export interface HighlightConflictDetails {
    existingHighlightId: string;
    relationship: Exclude<HighlightRangeRelationship, "distinct" | "exact">;
}

export class HighlightConflictError extends Error {
    readonly details: HighlightConflictDetails;

    constructor(message: string, details: HighlightConflictDetails) {
        super(message);
        this.name = "HighlightConflictError";
        this.details = details;
    }
}

interface CreateHighlightResult {
    highlight: UserHighlight;
    disposition: "created" | "existing";
}

function getHighlightMutationError(errorData: unknown, fallbackMessage: string): Error {
    const response = errorData && typeof errorData === "object"
        ? errorData as {
            error?: {
                code?: unknown;
                message?: unknown;
                details?: {
                    existing_highlight_id?: unknown;
                    relationship?: unknown;
                };
            };
        }
        : {};
    const details = response.error?.details;
    const relationship = details?.relationship;

    if (
        response.error?.code === "CONFLICT"
        && typeof details?.existing_highlight_id === "string"
        && (
            relationship === "contained"
            || relationship === "contains"
            || relationship === "partial-overlap"
        )
    ) {
        return new HighlightConflictError(
            typeof response.error?.message === "string" ? response.error.message : fallbackMessage,
            {
                existingHighlightId: details.existing_highlight_id,
                relationship,
            }
        );
    }

    return new Error(
        typeof response.error?.message === "string" ? response.error.message : fallbackMessage
    );
}

export function useCreateHighlight() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: async (args: CreateHighlightArgs): Promise<CreateHighlightResult> => {
            const res = await fetch("/api/library/highlights", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(args),
            });

            if (!res.ok) {
                const errorData = await res.json().catch(() => ({}));
                throw getHighlightMutationError(errorData, "Failed to create highlight");
            }

            const { data, disposition } = await res.json();
            return {
                highlight: data as UserHighlight,
                disposition: disposition === "existing" ? "existing" : "created",
            };
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
                segment: null,
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
    highlighted_text?: string;
    anchor_start?: number;
    anchor_end?: number;
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
                    highlighted_text: args.highlighted_text,
                    anchor_start: args.anchor_start,
                    anchor_end: args.anchor_end,
                }),
            });

            if (!res.ok) {
                const errorData = await res.json().catch(() => ({}));
                throw getHighlightMutationError(errorData, "Failed to update highlight");
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
                            highlighted_text: updatedArgs.highlighted_text !== undefined
                                ? updatedArgs.highlighted_text
                                : h.highlighted_text,
                            anchor_start: updatedArgs.anchor_start !== undefined
                                ? updatedArgs.anchor_start
                                : h.anchor_start,
                            anchor_end: updatedArgs.anchor_end !== undefined
                                ? updatedArgs.anchor_end
                                : h.anchor_end,
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
