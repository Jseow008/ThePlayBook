import "server-only";

import { createClient } from "@/lib/supabase/server";

export type VerifiedAccountDataSession = {
    accountId: string;
    sessionId: string;
};

/**
 * Verifies both the current account and the Supabase Auth session that owns
 * a resumable export. `getUser` catches deleted or revoked users; `getClaims`
 * verifies the access-token claims rather than trusting cookie contents.
 */
export async function getVerifiedAccountDataSession(): Promise<VerifiedAccountDataSession | null> {
    const supabase = await createClient();
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) return null;

    const { data, error } = await supabase.auth.getClaims();
    const claims = data?.claims;
    if (
        error
        || !claims
        || claims.sub !== user.id
        || typeof claims.session_id !== "string"
    ) {
        return null;
    }

    return { accountId: user.id, sessionId: claims.session_id };
}
