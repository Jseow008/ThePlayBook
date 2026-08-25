"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, Compass } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { APP_ONBOARDING_TOUR_KEY, APP_ONBOARDING_VERSION } from "@/lib/onboarding";
import { createClient } from "@/lib/supabase/client";

interface WelcomeActivationProps {
    nextUrl: string;
}

export function WelcomeActivation({ nextUrl }: WelcomeActivationProps) {
    const router = useRouter();
    const [isContinuing, setIsContinuing] = useState(false);

    const continueToLibrary = async () => {
        setIsContinuing(true);

        try {
            const supabase = createClient();
            const { error } = await supabase.rpc("set_onboarding_state", {
                p_tour: APP_ONBOARDING_TOUR_KEY,
                p_version: APP_ONBOARDING_VERSION,
                p_status: "completed",
            } as never);

            if (error) {
                console.error("Failed to complete activation", error);
                toast.error("We couldn't save your progress. Please try again.");
                return;
            }

            router.replace(nextUrl);
        } catch (error) {
            console.error("Failed to complete activation", error);
            toast.error("We couldn't save your progress. Please try again.");
        } finally {
            setIsContinuing(false);
        }
    };

    return (
        <div className="min-h-screen bg-background flex flex-col items-center justify-center p-4">
            <section className="w-full max-w-md rounded-2xl border border-border/50 bg-card/35 p-7 text-center shadow-sm backdrop-blur-sm sm:p-9">
                <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary">
                    <Compass className="h-6 w-6" />
                </div>
                <p className="mt-6 text-xs font-semibold uppercase tracking-[0.18em] text-primary">Welcome to Netflux</p>
                <h1 className="mt-3 text-3xl font-bold tracking-tight text-foreground">Your library starts here.</h1>
                <p className="mt-3 text-sm leading-6 text-muted-foreground">
                    Start with a summary that earns your time. Save the ideas you want to return to, then make them useful when you need them.
                </p>
                <Button
                    type="button"
                    className="mt-7 h-11 w-full font-medium bg-primary text-primary-foreground hover:bg-primary/90"
                    onClick={continueToLibrary}
                    disabled={isContinuing}
                >
                    {isContinuing ? "Preparing your library…" : "Explore the library"}
                    {!isContinuing && <ArrowRight className="ml-2 h-4 w-4" />}
                </Button>
            </section>
        </div>
    );
}
