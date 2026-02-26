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

type UserLibraryRow = Database["public"]["Tables"]["user_library"]["Row"];
type UserLibraryInsert = Database["public"]["Tables"]["user_library"]["Insert"];
type UserLibraryUpdate = Database["public"]["Tables"]["user_library"]["Update"];

type TypedSupabaseClient = SupabaseClient<any, any, any>;

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
