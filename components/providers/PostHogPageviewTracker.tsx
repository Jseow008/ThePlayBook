"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { captureAnalyticsPageview, type AnalyticsPageviewProperties } from "@/lib/analytics";
import { createClient } from "@/lib/supabase/client";
import { resolveAuthUserResult } from "@/lib/supabase/auth-errors";

type AnalyticsUserState = AnalyticsPageviewProperties["user_state"];

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
    const [userState, setUserState] = useState<AnalyticsUserState | undefined>(undefined);
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
        if (!shouldTrack) {
            return;
        }

        const supabase = createClient();
        let isMounted = true;

        supabase.auth.getUser().then((result) => {
            if (!isMounted) return;

            const { user, error } = resolveAuthUserResult(result);
            setUserState(error || !user ? "anonymous" : "authenticated");
        }).catch(() => {
            if (isMounted) {
                setUserState("anonymous");
            }
        });

        const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
            if (!isMounted) return;
            setUserState(session?.user ? "authenticated" : "anonymous");
        });

        return () => {
            isMounted = false;
            subscription.unsubscribe();
        };
    }, [shouldTrack]);

    useEffect(() => {
        if (!pathname || !shouldTrack || userState === undefined || lastTrackedUrlRef.current === urlState.key) {
            return;
        }

        lastTrackedUrlRef.current = urlState.key;

        captureAnalyticsPageview({
            path: pathname,
            search_present: urlState.searchPresent,
            user_state: userState,
            content_id: getContentId(pathname),
        });
    }, [pathname, shouldTrack, userState, urlState]);

    return null;
}
