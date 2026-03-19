"use client";

import { startTransition, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { resolveAuthUserResult } from "@/lib/supabase/auth-errors";

export function LandingRedirectGuard() {
    const router = useRouter();
    const redirectedRef = useRef(false);

    useEffect(() => {
        let isActive = true;
        const supabase = createClient();

        void supabase.auth.getUser().then((result) => {
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
        });

        return () => {
            isActive = false;
        };
    }, [router]);

    return null;
}
