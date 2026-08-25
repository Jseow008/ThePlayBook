import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { WelcomeActivation } from "@/components/ui/WelcomeActivation";
import { resolveAuthUserResult } from "@/lib/supabase/auth-errors";
import { normalizeLoginNextPath } from "@/lib/auth-redirect";
import { APP_NAME } from "@/lib/brand";
import { createClient } from "@/lib/supabase/server";
import { resolvePostAuthDestination } from "@/lib/auth-activation";

export const metadata: Metadata = {
    title: `Welcome - ${APP_NAME}`,
    robots: { index: false, follow: false },
};

export default async function WelcomePage({
    searchParams,
}: {
    searchParams: Promise<{ next?: string | string[] }>;
}) {
    const params = await searchParams;
    const requestedNext = normalizeLoginNextPath(typeof params.next === "string" ? params.next : undefined);
    const supabase = await createClient();
    const { user } = resolveAuthUserResult(await supabase.auth.getUser());

    if (!user) {
        redirect(`/login?next=${encodeURIComponent("/welcome")}`);
    }

    const destination = await resolvePostAuthDestination(supabase, user, requestedNext);
    if (destination === requestedNext) {
        redirect(requestedNext);
    }

    return <WelcomeActivation nextUrl={requestedNext} />;
}
