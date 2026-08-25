import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { WelcomeActivation } from "@/components/ui/WelcomeActivation";
import type { WelcomeContentItem } from "@/components/ui/WelcomeActivation";
import { resolveAuthUserResult } from "@/lib/supabase/auth-errors";
import { normalizeLoginNextPath } from "@/lib/auth-redirect";
import { APP_NAME } from "@/lib/brand";
import { createClient } from "@/lib/supabase/server";
import { resolvePostAuthDestination } from "@/lib/auth-activation";
import { createPublicServerClient } from "@/lib/supabase/public-server";

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

    const publicSupabase = createPublicServerClient();
    const { data: items, error } = await publicSupabase
        .from("content_item")
        .select("id, title, author, category, cover_image_url, type")
        .eq("status", "verified")
        .is("deleted_at", null)
        .order("published_at", { ascending: false })
        .limit(24);

    if (error) {
        console.error("Failed to load welcome starter shelf", error);
    }

    return <WelcomeActivation nextUrl={requestedNext} items={(items ?? []) as WelcomeContentItem[]} />;
}
