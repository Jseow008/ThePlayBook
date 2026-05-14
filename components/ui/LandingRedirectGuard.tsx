"use client";

import { startTransition, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";

export function LandingRedirectGuard() {
    const router = useRouter();
    const redirectedRef = useRef(false);

    useEffect(() => {
        let isActive = true;

        async function redirectAuthenticatedUser() {
            try {
                const [{ createClient }, { resolveAuthUserResult }] = await Promise.all([
                    import("@/lib/supabase/client"),
                    import("@/lib/supabase/auth-errors"),
                ]);

                const supabase = createClient();
                const result = await supabase.auth.getUser();

                if (!isActive || redirectedRef.current) {
                    return;
                }

                const { user, error } = resolveAuthUserResult(result);
                if (error) {
                    console.error("Failed to resolve landing auth state", error);
                    return;
                }

                if (!user) {
                    return;
                }

                redirectedRef.current = true;
                startTransition(() => {
                    router.replace("/browse");
                });
            } catch (error) {
                if (isActive) {
                    console.error("Failed to resolve landing auth state", error);
                }
            }
        }

        void redirectAuthenticatedUser();

        return () => {
            isActive = false;
        };
    }, [router]);

    return null;
}
