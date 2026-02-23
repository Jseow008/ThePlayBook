import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
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

// ----------------------------------------------------------------------------
// Fetch Highlights
// ----------------------------------------------------------------------------
export function useHighlights(contentItemId?: string) {
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
        onSuccess: (newHighlight, variables) => {
            // Invalidate the specific item highlights and global highlights
            queryClient.invalidateQueries({ queryKey: ["highlights", variables.content_item_id] });
            queryClient.invalidateQueries({ queryKey: ["highlights", undefined] });
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
        onSuccess: () => {
            // Invalidate all highlight queries since we don't know which item this belonged to easily here
            queryClient.invalidateQueries({ queryKey: ["highlights"] });
        },
    });
}
