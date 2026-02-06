/**
 * Supabase Browser Client
 * 
 * Client-side Supabase client for use in Client Components.
 * Uses singleton pattern to avoid creating multiple clients.
 */

import { createBrowserClient } from "@supabase/ssr";
import type { Database } from "@/types/database";

let client: ReturnType<typeof createBrowserClient<Database>> | null = null;

export function createClient() {
    if (client) return client;

    client = createBrowserClient<Database>(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    );

    return client;
}
