import { createClient } from "@/lib/supabase/client";

let pending: ReturnType<ReturnType<typeof createClient>["auth"]["getUser"]> | undefined;

/** Share concurrent bootstrap reads without caching a resolved identity. */
export function getBrowserUser() {
    if (!pending) {
        const request = createClient().auth.getUser().finally(() => {
            if (pending === request) pending = undefined;
        });
        pending = request;
    }
    return pending;
}

export function resetBrowserUserLookup() {
    pending = undefined;
}
