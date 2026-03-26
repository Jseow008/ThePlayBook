"use client";

import { createContext, createElement, useContext, useEffect, useState, type ReactNode } from "react";
import type { User } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/client";
import { resolveAuthUserResult } from "@/lib/supabase/auth-errors";

const AUTH_CONTEXT_MISSING = Symbol("AUTH_CONTEXT_MISSING");
const AuthUserContext = createContext<User | null | undefined | typeof AUTH_CONTEXT_MISSING>(AUTH_CONTEXT_MISSING);

export function AuthUserProvider({
    children,
    initialUser,
}: {
    children: ReactNode;
    initialUser?: User | null | undefined;
}) {
    const [user, setUser] = useState<User | null | undefined>(initialUser);

    useEffect(() => {
        setUser(initialUser);
    }, [initialUser]);

    useEffect(() => {
        const supabase = createClient();
        let isMounted = true;

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

        const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
            if (!isMounted) return;
            setUser(session?.user ?? null);
        });

        return () => {
            isMounted = false;
            subscription.unsubscribe();
        };
    }, []);

    return createElement(AuthUserContext.Provider, { value: user }, children);
}

export function useAuthUser() {
    const user = useContext(AuthUserContext);

    if (user === AUTH_CONTEXT_MISSING) {
        throw new Error("useAuthUser must be used within an AuthUserProvider");
    }

    return user;
}
