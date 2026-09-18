import "server-only";
import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "@/types/database";
import type { createClient } from "@/lib/supabase/server";
import type { PersonalEvidenceScope } from "@/lib/personal-evidence";

const statusSchema = z.object({
    status: z.literal("ready"), total_records: z.number().int().nonnegative(),
    ready_records: z.number().int().nonnegative(), pending_records: z.literal(0), failed_records: z.literal(0),
});
/** getUser alone accepts some unexpired tokens after logout. This RPC checks the live auth.sessions row. */
export async function assertActivePersonalRetrievalSession(options: {
    supabase: Awaited<ReturnType<typeof createClient>>; scope: PersonalEvidenceScope; signal: AbortSignal;
}) {
    options.signal.throwIfAborted();
    const client = options.supabase as unknown as Pick<SupabaseClient<Database>, "rpc">;
    const { data, error } = await client.rpc("personal_evidence_index_status", { p_scope: options.scope as Json }).abortSignal(options.signal);
    options.signal.throwIfAborted();
    const status = statusSchema.safeParse(data);
    if (error || !status.success || status.data.ready_records !== status.data.total_records) throw new Error("RETRIEVAL_SESSION_OR_INDEX_CHANGED");
}
