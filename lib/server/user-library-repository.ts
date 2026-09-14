/**
 * User Library Repository
 *
 * Typed access layer for the `user_library` table.
 *
 * WHY THE CAST EXISTS:
 * `user_library` has a composite primary key (user_id, content_id) and no
 * single `id` column. supabase-js v2 + PostgrestVersion "14.1" cannot infer
 * the Row/Insert/Update shapes for such tables via the normal `.from()` chain,
 * causing TypeScript to widen the type to `never`. The cast is confined here —
 * a single boundary — so the rest of the codebase remains fully typed.
 *
 * TECH-DEBT: Remove this cast once supabase-js resolves composite-PK inference
 * (tracked in: https://github.com/supabase/supabase-js/issues — composite PK).
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import type { Json } from "@/types/database";

type UserLibraryRow = Database["public"]["Tables"]["user_library"]["Row"];
type UserLibraryInsert = Database["public"]["Tables"]["user_library"]["Insert"];
type UserLibraryUpdate = Database["public"]["Tables"]["user_library"]["Update"];

type TypedSupabaseClient = SupabaseClient<any, any, any>;
type MutationRpc = (
    functionName: "apply_user_library_mutation",
    arguments_: Record<string, unknown>,
) => Promise<{ data: Array<{ reset_epoch: number; library_revision: number }> | null; error: Error | null }>;

export type UserLibraryMutationAcknowledgement = {
    resetEpoch: number;
    libraryRevision: number;
};

// Narrow boundary cast — isolated here so callers are fully typed.
const userLibraryTable = (client: TypedSupabaseClient) => (client.from("user_library") as any);

/** Upsert a row into user_library. Conflict target: (user_id, content_id). */
export async function upsertUserLibrary(
    client: TypedSupabaseClient,
    row: UserLibraryInsert
): Promise<{ error: Error | null }> {
    const { error } = await userLibraryTable(client).upsert(row, {
        onConflict: "user_id,content_id",
    });
    return { error };
}

/** Fetch a single user_library row by user + content. Returns null if not found. */
export async function getUserLibraryRow(
    client: TypedSupabaseClient,
    userId: string,
    contentId: string
): Promise<{ data: UserLibraryRow | null; error: Error | null }> {
    const { data, error } = await userLibraryTable(client)
        .select("*")
        .eq("user_id", userId)
        .eq("content_id", contentId)
        .maybeSingle();
    return { data: data as UserLibraryRow | null, error };
}

/** Update a user_library row by user + content. */
export async function updateUserLibrary(
    client: TypedSupabaseClient,
    userId: string,
    contentId: string,
    patch: UserLibraryUpdate
): Promise<{ error: Error | null }> {
    const { error } = await userLibraryTable(client)
        .update(patch)
        .eq("user_id", userId)
        .eq("content_id", contentId);
    return { error };
}

/** Delete a user_library row by user + content. */
export async function deleteUserLibrary(
    client: TypedSupabaseClient,
    userId: string,
    contentId: string
): Promise<{ error: Error | null }> {
    const { error } = await userLibraryTable(client)
        .delete()
        .eq("user_id", userId)
        .eq("content_id", contentId);
    return { error };
}

/**
 * Applies a complete library item state and returns the exact account
 * boundary produced by the same database transaction. This is deliberately
 * distinct from generic CRUD helpers: hydration reconciliation must never
 * infer a revision from an older snapshot.
 */
export async function commitUserLibraryMutation(
    client: TypedSupabaseClient,
    input: {
        contentId: string;
        isBookmarked: boolean;
        progress: Json | null;
        lastInteractedAt: string;
        deleteIfEmpty: boolean;
    },
): Promise<{ data: UserLibraryMutationAcknowledgement | null; error: Error | null }> {
    const rpc = client.rpc as unknown as MutationRpc;
    const { data, error } = await rpc("apply_user_library_mutation", {
        p_content_id: input.contentId,
        p_is_bookmarked: input.isBookmarked,
        p_progress: input.progress,
        p_last_interacted_at: input.lastInteractedAt,
        p_delete_if_empty: input.deleteIfEmpty,
    });
    const row = Array.isArray(data) ? data[0] : data;
    if (!row) return { data: null, error: error as Error | null };
    return {
        data: {
            resetEpoch: Number(row.reset_epoch),
            libraryRevision: Number(row.library_revision),
        },
        error: error as Error | null,
    };
}
