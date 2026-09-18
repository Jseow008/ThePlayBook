import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { BrainClientPage } from "./client-page";
import type { HighlightsPage } from "@/hooks/useHighlights";
import type { ReflectionWithContent } from "@/hooks/useReflections";
import { buildLoginHref } from "@/lib/auth-redirect";

export const metadata = {
    title: "Notes",
    description: "Manage your highlights, notes, and personal knowledge base.",
};

interface BrainPageProps {
    searchParams?: Promise<{
        ask?: string;
    }>;
}

export default async function BrainPage({ searchParams }: BrainPageProps) {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    const resolvedSearchParams = await searchParams;

    if (!user) {
        const loginTarget = resolvedSearchParams?.ask === "1"
            ? "/notes?ask=1"
            : "/notes";

        redirect(buildLoginHref(loginTarget));
    }

    const { data: reflections, error: reflectionsError } = await supabase
        .from("user_reflections")
        .select("id, content_item_id, prompt, reflection_text, created_at, updated_at, content_item ( id, title, author, cover_image_url )")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false });

    if (reflectionsError) {
        console.error("Failed to load reflections:", reflectionsError);
    }

    const initialPage: HighlightsPage = {
        // Highlights now load through the account-bound, signed-cursor API so
        // search and filters are applied before traversal.
        data: [],
        nextCursor: null,
    };

    return (
        <BrainClientPage
            initialPage={initialPage}
            initialReflections={(reflections || []) as ReflectionWithContent[]}
            initialAskOpen={resolvedSearchParams?.ask === "1"}
        />
    );
}
