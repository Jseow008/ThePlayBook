import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { UserReflection } from "@/types/database";

export type ReflectionWithContent = UserReflection & {
    content_item: {
        id: string;
        title: string;
        author: string | null;
        cover_image_url: string | null;
    } | null;
};

export function useReflections(contentItemId?: string, initialData?: ReflectionWithContent[]) {
    return useQuery({
        queryKey: ["reflections", contentItemId ?? null],
        queryFn: async (): Promise<ReflectionWithContent[]> => {
            const search = contentItemId ? `?content_item_id=${encodeURIComponent(contentItemId)}` : "";
            const response = await fetch(`/api/library/reflections${search}`);
            if (!response.ok) {
                if (response.status === 401) return [];
                throw new Error("Failed to load reflections");
            }
            const { data } = await response.json();
            return data as ReflectionWithContent[];
        },
        initialData,
    });
}

interface SaveReflectionArgs {
    content_item_id: string;
    prompt: string;
    reflection_text: string;
}

export function useSaveReflection() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: async (args: SaveReflectionArgs): Promise<UserReflection> => {
            const response = await fetch("/api/library/reflections", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(args),
            });
            if (!response.ok) {
                const body = await response.json().catch(() => ({}));
                throw new Error(body?.error?.message || "Failed to save reflection");
            }
            const { data } = await response.json();
            return data as UserReflection;
        },
        onSuccess: (_reflection, variables) => {
            void queryClient.invalidateQueries({ queryKey: ["reflections"] });
            void queryClient.invalidateQueries({ queryKey: ["reflections", variables.content_item_id] });
        },
    });
}
