"use client";

import { useEffect, useState } from "react";
import type { User } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/client";

export function useAuthUser(initialUser: User | null) {
    const [user, setUser] = useState<User | null>(initialUser);

    useEffect(() => {
        setUser(initialUser);
    }, [initialUser]);

    useEffect(() => {
        const supabase = createClient();
        let isMounted = true;

        supabase.auth.getUser().then(({ data, error }) => {
            if (!isMounted || error) return;
            setUser(data.user ?? null);
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

    return user;
}
