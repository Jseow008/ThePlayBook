"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useAuthUser } from "@/hooks/useAuthUser";
import {
    APP_ONBOARDING_SLIDES,
    APP_ONBOARDING_QUERY_PARAM,
    APP_ONBOARDING_REPLAY_VALUE,
    APP_ONBOARDING_TOUR_KEY,
    APP_ONBOARDING_VERSION,
    GUEST_ONBOARDING_STORAGE_KEY,
    createGuestOnboardingEntry,
    hasSeenOnboardingVersion,
    hasSeenGuestOnboarding,
    type OnboardingStatus,
} from "@/lib/onboarding";
import { createClient } from "@/lib/supabase/client";
import type { Database } from "@/types/database";
import { AppOnboardingTour } from "@/components/ui/AppOnboardingTour";

type ProfileRow = Database["public"]["Tables"]["profiles"]["Row"];
type ActiveTour = "account" | "guest" | null;
const REPLAY_OPEN_DELAY_MS = 1200;

export function AppOnboardingGate() {
    const pathname = usePathname();
    const router = useRouter();
    const searchParams = useSearchParams();
    const user = useAuthUser();
    const [isOpen, setIsOpen] = useState(false);
    const [isSaving, setIsSaving] = useState(false);
    const [activeTour, setActiveTour] = useState<ActiveTour>(null);

    const isBrowseRoute = pathname === "/browse";
    const replayRequested = searchParams.get(APP_ONBOARDING_QUERY_PARAM) === APP_ONBOARDING_REPLAY_VALUE;

    useEffect(() => {
        let isCancelled = false;
        let replayTimer: number | null = null;

        async function loadOnboardingState() {
            if (!isBrowseRoute) {
                setIsOpen(false);
                setActiveTour(null);
                return;
            }

            if (user === undefined) {
                return;
            }

            if (replayRequested) {
                setActiveTour(user ? "account" : "guest");
                replayTimer = window.setTimeout(() => {
                    if (isCancelled) return;
                    setIsOpen(true);
                }, REPLAY_OPEN_DELAY_MS);
                return;
            }

            if (!user) {
                const guestStorageValue = window.localStorage.getItem(GUEST_ONBOARDING_STORAGE_KEY);
                const hasSeenGuestTour = hasSeenGuestOnboarding(guestStorageValue);

                setActiveTour(hasSeenGuestTour ? null : "guest");
                setIsOpen(!hasSeenGuestTour);
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

            const shouldOpen = replayRequested || !hasSeenCurrentVersion;
            setActiveTour(shouldOpen ? "account" : null);
            setIsOpen(shouldOpen);
        }

        void loadOnboardingState();

        return () => {
            isCancelled = true;
            if (replayTimer !== null) {
                window.clearTimeout(replayTimer);
            }
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
            if (activeTour === "account" && user) {
                const supabase = createClient();
                const { error } = await supabase.rpc("set_onboarding_state", {
                    p_tour: APP_ONBOARDING_TOUR_KEY,
                    p_version: APP_ONBOARDING_VERSION,
                    p_status: status,
                } as never);

                if (error) {
                    console.error("Failed to persist onboarding state", error);
                }
            } else if (activeTour === "guest") {
                window.localStorage.setItem(
                    GUEST_ONBOARDING_STORAGE_KEY,
                    JSON.stringify(createGuestOnboardingEntry(status))
                );
            }
        } finally {
            setIsOpen(false);
            setActiveTour(null);
            clearReplayParam();
            setIsSaving(false);
        }
    };

    return (
        <AppOnboardingTour
            isOpen={isOpen}
            isSaving={isSaving}
            onFinish={handleFinish}
            slides={APP_ONBOARDING_SLIDES}
        />
    );
}
