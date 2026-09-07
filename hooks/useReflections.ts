import { useAuthUser } from "@/hooks/useAuthUser";
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
    const user = useAuthUser();
    return useQuery({
        queryKey: ["reflections", contentItemId ?? null, user?.id ?? null],
        enabled: Boolean(user),
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

interface UpdateReflectionArgs {
    id: string;
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

export function useUpdateReflection() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: async ({ id, reflection_text }: UpdateReflectionArgs): Promise<UserReflection> => {
            const response = await fetch(`/api/library/reflections/${id}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ reflection_text }),
            });
            if (!response.ok) {
                const body = await response.json().catch(() => ({}));
                throw new Error(body?.error?.message || "Failed to update reflection");
            }
            const { data } = await response.json();
            return data as UserReflection;
        },
        onSuccess: () => {
            void queryClient.invalidateQueries({ queryKey: ["reflections"] });
        },
    });
}

export function useDeleteReflection() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: async (id: string) => {
            const response = await fetch(`/api/library/reflections/${id}`, {
                method: "DELETE",
            });
            if (!response.ok) {
                const body = await response.json().catch(() => ({}));
                throw new Error(body?.error?.message || "Failed to delete reflection");
            }
        },
        onSuccess: () => {
            void queryClient.invalidateQueries({ queryKey: ["reflections"] });
        },
    });
}
