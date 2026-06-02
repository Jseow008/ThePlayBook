"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import {
    captureAnalyticsPageview,
    identifyAnalyticsUser,
    resetAnalyticsUser,
    type AnalyticsIdentityProperties,
} from "@/lib/analytics";
import { createClient } from "@/lib/supabase/client";
import { resolveAuthUserResult } from "@/lib/supabase/auth-errors";
import type { UserRole } from "@/types/database";

type AnalyticsUserId = string | null | undefined;
type AnalyticsProfile = {
    role: UserRole | null;
    is_internal: boolean | null;
};

function getUserState(userId: AnalyticsUserId) {
    return userId ? "authenticated" : "anonymous";
}

function shouldTrackPageview(pathname: string): boolean {
    return !(
        pathname === "/admin-login"
        || pathname === "/auth/callback"
        || pathname.startsWith("/admin")
    );
}

function getContentId(pathname: string): string | undefined {
    const [route, id] = pathname.split("/").filter(Boolean);

    if ((route === "read" || route === "preview") && id) {
        return id;
    }

    return undefined;
}

export function PostHogPageviewTracker() {
    const pathname = usePathname();
    const searchParams = useSearchParams();
    const [userId, setUserId] = useState<AnalyticsUserId>(undefined);
    const lastIdentityKeyRef = useRef<string | null>(null);
    const lastTrackedUrlRef = useRef<string | null>(null);

    const shouldTrack = pathname ? shouldTrackPageview(pathname) : false;
    const urlState = useMemo(() => {
        const searchParamsString = searchParams.toString();

        return {
            key: `${pathname}?${searchParamsString}`,
            searchPresent: searchParamsString.length > 0,
        };
    }, [pathname, searchParams]);

    useEffect(() => {
        const supabase = createClient();
        let isMounted = true;

        supabase.auth.getUser().then((result) => {
            if (!isMounted) return;

            const { user, error } = resolveAuthUserResult(result);
            setUserId(error || !user ? null : user.id);
        }).catch(() => {
            if (isMounted) {
                setUserId(null);
            }
        });

        const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
            if (!isMounted) return;
            setUserId(session?.user?.id ?? null);
        });

        return () => {
            isMounted = false;
            subscription.unsubscribe();
        };
    }, []);

    useEffect(() => {
        if (userId === undefined) {
            return;
        }

        if (!userId) {
            if (lastIdentityKeyRef.current) {
                resetAnalyticsUser();
            }

            lastIdentityKeyRef.current = null;
            return;
        }

        const resolvedUserId = userId;
        const supabase = createClient();
        let isCancelled = false;

        async function identifyUser() {
            const properties: AnalyticsIdentityProperties = {
                account_role: "user",
                is_internal: false,
                profile_available: false,
            };

            try {
                const { data, error } = await supabase
                    .from("profiles")
                    .select("role, is_internal")
                    .eq("id", resolvedUserId)
                    .maybeSingle<AnalyticsProfile>();

                if (!error && data) {
                    properties.account_role = data.role === "admin" ? "admin" : "user";
                    properties.is_internal = Boolean(data.is_internal);
                    properties.profile_available = true;
                } else if (error) {
                    console.error("Failed to load analytics identity profile:", error);
                }
            } catch (error) {
                console.error("Failed to resolve analytics identity profile:", error);
            }

            if (isCancelled) {
                return;
            }

            const identityKey = JSON.stringify([resolvedUserId, properties]);
            if (lastIdentityKeyRef.current === identityKey) {
                return;
            }

            identifyAnalyticsUser(resolvedUserId, properties);
            lastIdentityKeyRef.current = identityKey;
        }

        void identifyUser();

        return () => {
            isCancelled = true;
        };
    }, [userId]);

    useEffect(() => {
        if (!pathname || !shouldTrack || userId === undefined || lastTrackedUrlRef.current === urlState.key) {
            return;
        }

        lastTrackedUrlRef.current = urlState.key;

        captureAnalyticsPageview({
            path: pathname,
            search_present: urlState.searchPresent,
            user_state: getUserState(userId),
            content_id: getContentId(pathname),
        });
    }, [pathname, shouldTrack, userId, urlState]);

    return null;
}
