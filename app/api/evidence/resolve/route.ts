import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { resolveEvidenceCitation } from "@/lib/server/evidence-citation";
import { assertActiveChatSession, ChatSessionValidationError } from "@/lib/server/personal-retrieval-session";
import { rateLimit } from "@/lib/server/rate-limit";

export const maxDuration = 30;
const headers = { "Cache-Control": "private, no-store", "Referrer-Policy": "no-referrer" };
const json = (body: unknown, status = 200) => NextResponse.json(body, { status, headers });

export async function POST(request: NextRequest) {
    const signal = AbortSignal.any([request.signal, AbortSignal.timeout(20_000)]);
    try {
        const supabase = await createClient();
        const { data: { user }, error } = await supabase.auth.getUser();
        if (error || !user) return json({ error: "UNAUTHORIZED" }, 401);
        await assertActiveChatSession({ supabase, signal });
        const limit = await rateLimit(request, { limit: 30, windowMs: 60_000, key: `${user.id}:citation` });
        if (!limit.success) return json({ error: "RATE_LIMITED" }, 429);
        // Enforce the bound while reading, not just on an optional Content-Length.
        const reader = request.body?.getReader();
        if (!reader) return json({ state: "unavailable" });
        const cancelRead = () => { void reader.cancel().catch(() => {}); };
        signal.addEventListener("abort", cancelRead, { once: true });
        const chunks: Uint8Array[] = [];
        let size = 0;
        try {
            while (true) {
                signal.throwIfAborted();
                const { value, done } = await reader.read();
                if (done) break;
                size += value.length;
                if (size > 24_000) { await reader.cancel(); return json({ error: "INVALID_REFERENCE" }, 413); }
                chunks.push(value);
            }
        } finally { signal.removeEventListener("abort", cancelRead); reader.releaseLock(); }
        signal.throwIfAborted();
        let token: unknown;
        try { token = JSON.parse(Buffer.concat(chunks).toString("utf8")).token; }
        catch { return json({ state: "unavailable" }); }
        if (typeof token !== "string") return json({ state: "unavailable" });
        const result = await resolveEvidenceCitation({ token, userId: user.id, supabase, signal });
        await assertActiveChatSession({ supabase, signal });
        const { data: { user: finalUser }, error: finalError } = await supabase.auth.getUser();
        signal.throwIfAborted();
        if (finalError || finalUser?.id !== user.id) return json({ error: "UNAUTHORIZED" }, 401);
        return json(result);
    } catch (error) {
        // Never log tokens or captured text, including exception payloads.
        if (error instanceof ChatSessionValidationError && error.code === "UNAUTHORIZED") return json({ error: "UNAUTHORIZED" }, 401);
        return json({ error: "CITATION_UNAVAILABLE" }, 503);
    }
}
