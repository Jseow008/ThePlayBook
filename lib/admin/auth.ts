/**
 * Admin Authentication Utilities
 *
 * Uses Supabase Auth with Role-Based Access Control.
 * Admin role is stored in the profiles table.
 */

import { createClient } from "@/lib/supabase/server";
import { recordAdminAuthFailure } from "@/lib/server/security-telemetry";

interface VerifyAdminSessionOptions {
    request?: Request;
    requestId?: string;
    route?: string;
}

/**
 * Verify the current request has a valid admin session
 * Checks both authentication AND admin role
 */
export async function verifyAdminSession(options: VerifyAdminSessionOptions = {}): Promise<boolean> {
    try {
        const supabase = await createClient();
        const { data: { user }, error: userError } = await supabase.auth.getUser();

        if (userError || !user) {
            recordAdminAuthFailure({
                request: options.request,
                requestId: options.requestId,
                route: options.route,
                reason: userError ? "user_lookup_failed" : "missing_user",
            });
            return false;
        }

        // Check admin role using user-scoped client (reduced privileged surface area)
        const { data: profileRaw, error: profileError } = await supabase
            .from("profiles")
            .select("role")
            .eq("id", user.id)
            .single();

        if (profileError || !profileRaw) {
            recordAdminAuthFailure({
                request: options.request,
                requestId: options.requestId,
                route: options.route,
                reason: profileError ? "profile_lookup_failed" : "missing_profile",
                userId: user.id,
            });
            return false;
        }

        const profile = profileRaw as { role?: string };
        if (profile.role !== "admin") {
            recordAdminAuthFailure({
                request: options.request,
                requestId: options.requestId,
                route: options.route,
                reason: "not_admin",
                userId: user.id,
            });
            return false;
        }

        return true;
    } catch (error) {
        const maybeDynamicError = error as { digest?: string };
        if (maybeDynamicError.digest === "DYNAMIC_SERVER_USAGE") {
            recordAdminAuthFailure({
                request: options.request,
                requestId: options.requestId,
                route: options.route,
                reason: "dynamic_server_usage",
            });
            return false;
        }
        console.error("Error verifying admin session:", error);
        recordAdminAuthFailure({
            request: options.request,
            requestId: options.requestId,
            route: options.route,
            reason: "verification_error",
        });
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
