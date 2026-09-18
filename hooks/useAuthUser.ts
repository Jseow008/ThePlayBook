"use client";

import { createContext, createElement, useContext, useEffect, useState, type ReactNode } from "react";
import type { User } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/client";
import { resolveAuthUserResult } from "@/lib/supabase/auth-errors";

const AUTH_CONTEXT_MISSING = Symbol("AUTH_CONTEXT_MISSING");
const AuthUserContext = createContext<User | null | undefined | typeof AUTH_CONTEXT_MISSING>(AUTH_CONTEXT_MISSING);
const AuthSessionEpochContext = createContext<number>(0);

export function AuthUserProvider({
    children,
    initialUser,
}: {
    children: ReactNode;
    initialUser?: User | null | undefined;
}) {
    const [user, setUser] = useState<User | null | undefined>(initialUser);
    const [hasHydrated, setHasHydrated] = useState(false);
    const [sessionEpoch, setSessionEpoch] = useState(0);

    useEffect(() => {
        setUser(initialUser);
    }, [initialUser]);

    useEffect(() => {
        const supabase = createClient();
        let isMounted = true;

        if (initialUser === undefined) {
            supabase.auth.getUser().then((result) => {
                if (!isMounted) return;
                const { user, error } = resolveAuthUserResult(result);
                if (error) {
                    setUser((current) => current === undefined ? null : current);
                    return;
                }
                setUser(user);
            }).catch(() => {
                if (!isMounted) return;
                setUser((current) => current === undefined ? null : current);
            });
        }

        setHasHydrated(true);

        const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
            if (!isMounted) return;
            setUser(session?.user ?? null);
            // A token refresh keeps the same authenticated session. A sign-in,
            // sign-out, or replacement session gets a new cache generation.
            if (_event !== "TOKEN_REFRESHED") {
                setSessionEpoch((current) => current + 1);
            }
        });

        return () => {
            isMounted = false;
            subscription.unsubscribe();
        };
    }, [initialUser]);

    const contextUser = hasHydrated ? user : initialUser;

    return createElement(
        AuthUserContext.Provider,
        { value: contextUser },
        createElement(AuthSessionEpochContext.Provider, { value: sessionEpoch }, children),
    );
}

export function useAuthUser() {
    const user = useContext(AuthUserContext);

    if (user === AUTH_CONTEXT_MISSING) {
        throw new Error("useAuthUser must be used within an AuthUserProvider");
    }

    return user;
}

export function useAuthSessionIdentity() {
    return {
        user: useAuthUser(),
        sessionEpoch: useContext(AuthSessionEpochContext),
    };
}
