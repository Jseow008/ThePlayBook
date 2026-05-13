/**
 * Admin Authentication Utilities
 *
 * Uses Supabase Auth with Role-Based Access Control.
 * Admin role is stored in the profiles table.
 */

import { createClient } from "@/lib/supabase/server";

/**
 * Verify the current request has a valid admin session
 * Checks both authentication AND admin role
 */
export async function verifyAdminSession(): Promise<boolean> {
    try {
        const supabase = await createClient();
        const { data: { user }, error: userError } = await supabase.auth.getUser();

        if (userError || !user) {
            return false;
        }

        // Check admin role using user-scoped client (reduced privileged surface area)
        const { data: profileRaw, error: profileError } = await supabase
            .from("profiles")
            .select("role")
            .eq("id", user.id)
            .single();

        if (profileError || !profileRaw) {
            return false;
        }

        const profile = profileRaw as { role?: string };
        return profile.role === "admin";
    } catch (error) {
        const maybeDynamicError = error as { digest?: string };
        if (maybeDynamicError.digest === "DYNAMIC_SERVER_USAGE") {
            return false;
        }
        console.error("Error verifying admin session:", error);
        return false;
    }
}

/**
 * Sign out the current user
 */
export async function signOut() {
    const supabase = await createClient();
    return supabase.auth.signOut();
}
