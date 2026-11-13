import { createClient } from "@/lib/supabase/client";

let pending: ReturnType<ReturnType<typeof createClient>["auth"]["getUser"]> | undefined;

/** Share concurrent bootstrap reads without caching a resolved identity. */
export function getBrowserUser() {
    if (!pending) {
        pending = createClient().auth.getUser().finally(() => {
            pending = undefined;
        });
    }
    return pending;
}
