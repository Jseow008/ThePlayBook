"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import type { User } from "@supabase/supabase-js";
import { useAuthUser } from "@/hooks/useAuthUser";
import {
    APP_ONBOARDING_QUERY_PARAM,
    APP_ONBOARDING_REPLAY_VALUE,
    APP_ONBOARDING_TOUR_KEY,
    APP_ONBOARDING_VERSION,
    hasSeenOnboardingVersion,
    type OnboardingStatus,
} from "@/lib/onboarding";
import { createClient } from "@/lib/supabase/client";
import type { Database } from "@/types/database";
import { AppOnboardingTour } from "@/components/ui/AppOnboardingTour";

type ProfileRow = Database["public"]["Tables"]["profiles"]["Row"];

export function AppOnboardingGate({ initialUser }: { initialUser: User | null }) {
    const pathname = usePathname();
    const router = useRouter();
    const searchParams = useSearchParams();
    const user = useAuthUser(initialUser);
    const [isOpen, setIsOpen] = useState(false);
    const [isSaving, setIsSaving] = useState(false);

    const isBrowseRoute = pathname === "/browse";
    const replayRequested = searchParams.get(APP_ONBOARDING_QUERY_PARAM) === APP_ONBOARDING_REPLAY_VALUE;

    useEffect(() => {
        let isCancelled = false;

        async function loadOnboardingState() {
            if (!isBrowseRoute) {
                setIsOpen(false);
                return;
            }

            if (!user) {
                setIsOpen(false);
                return;
            }

            const supabase = createClient();
            const { data, error } = await supabase
                .from("profiles")
                .select("onboarding_state")
                .eq("id", user.id)
                .single();

            if (isCancelled) return;

            if (error) {
                console.error("Failed to load onboarding state", error);
            }

            const profile = (data ?? null) as Pick<ProfileRow, "onboarding_state"> | null;
            const hasSeenCurrentVersion = hasSeenOnboardingVersion(
                profile?.onboarding_state ?? null,
                APP_ONBOARDING_TOUR_KEY,
                APP_ONBOARDING_VERSION
            );

            setIsOpen(replayRequested || !hasSeenCurrentVersion);
        }

        void loadOnboardingState();

        return () => {
            isCancelled = true;
        };
    }, [isBrowseRoute, replayRequested, user]);

    const clearReplayParam = () => {
        if (!searchParams.has(APP_ONBOARDING_QUERY_PARAM)) return;

        const nextParams = new URLSearchParams(searchParams.toString());
        nextParams.delete(APP_ONBOARDING_QUERY_PARAM);
        const nextQuery = nextParams.toString();
        router.replace(nextQuery ? `${pathname}?${nextQuery}` : pathname, { scroll: false });
    };

    const handleFinish = async (status: OnboardingStatus) => {
        setIsSaving(true);

        try {
            if (user) {
                const supabase = createClient();
                const { error } = await supabase.rpc("set_onboarding_state", {
                    p_tour: APP_ONBOARDING_TOUR_KEY,
                    p_version: APP_ONBOARDING_VERSION,
                    p_status: status,
                } as never);

                if (error) {
                    console.error("Failed to persist onboarding state", error);
                }
            }
        } finally {
            setIsOpen(false);
            clearReplayParam();
            setIsSaving(false);
        }
    };

    return <AppOnboardingTour isOpen={isOpen} isSaving={isSaving} onFinish={handleFinish} />;
}
