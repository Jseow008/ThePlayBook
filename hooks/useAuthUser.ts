"use client";

import { createContext, createElement, useContext, useEffect, useState, type ReactNode } from "react";
import type { User } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/client";
import { resolveAuthUserResult } from "@/lib/supabase/auth-errors";

const AuthUserContext = createContext<User | null | undefined>(undefined);

export function AuthUserProvider({
    children,
    initialUser = null,
}: {
    children: ReactNode;
    initialUser?: User | null;
}) {
    const [user, setUser] = useState<User | null>(initialUser);

    useEffect(() => {
        setUser(initialUser);
    }, [initialUser]);

    useEffect(() => {
        const supabase = createClient();
        let isMounted = true;

        supabase.auth.getUser().then((result) => {
            if (!isMounted) return;
            const { user, error } = resolveAuthUserResult(result);
            if (error) return;
            setUser(user);
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

    if (user === undefined) {
        throw new Error("useAuthUser must be used within an AuthUserProvider");
    }

    return user;
}
