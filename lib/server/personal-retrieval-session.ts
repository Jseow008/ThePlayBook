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
const sessionStatusSchema = statusSchema.extend({
    status: z.enum(["ready", "pending", "failed"]),
    pending_records: z.number().int().nonnegative(), failed_records: z.number().int().nonnegative(),
}).refine((status) => status.ready_records + status.pending_records + status.failed_records === status.total_records
    && status.status === (status.failed_records ? "failed" : status.pending_records ? "pending" : "ready"));

export class ChatSessionValidationError extends Error {
    constructor(public readonly code: "UNAUTHORIZED" | "UNAVAILABLE") {
        super(`Chat session validation failed: ${code}`);
    }
}

/** Metadata requests require a live session, but do not depend on embedding readiness. */
export async function assertActiveChatSession(options: {
    supabase: Awaited<ReturnType<typeof createClient>>; signal: AbortSignal;
}) {
    const signal = AbortSignal.any([options.signal, AbortSignal.timeout(10_000)]);
    signal.throwIfAborted();
    const client = options.supabase as unknown as Pick<SupabaseClient<Database>, "rpc">;
    const { data, error } = await client.rpc("personal_evidence_index_status", {
        p_scope: { version: 1, itemType: "all" },
    }).abortSignal(signal);
    signal.throwIfAborted();
    if (error?.code === "42501") throw new ChatSessionValidationError("UNAUTHORIZED");
    if (error || !sessionStatusSchema.safeParse(data).success) throw new ChatSessionValidationError("UNAVAILABLE");
}

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
