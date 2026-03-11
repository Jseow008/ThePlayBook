import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { BrainClientPage } from "./client-page";
import type { HighlightsPage } from "@/hooks/useHighlights";

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
        redirect("/login?next=/notes");
    }

    // Pre-fetch global highlights
    const { data: highlights, error } = await supabase
        .from("user_highlights")
        .select(`
            id,
            segment_id,
            anchor_start,
            anchor_end,
            highlighted_text,
            note_body,
            color,
            created_at,
            content_item ( id, title, author, cover_image_url ),
            segment ( id, title )
        `)
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(30);

    if (error) {
        console.error("Failed to load brain highlights:", error);
    }

    const initialPage: HighlightsPage = {
        data: (highlights || []) as HighlightsPage["data"],
        nextCursor:
            highlights && highlights.length === 30
                ? (highlights[highlights.length - 1] as { created_at?: string | null })?.created_at ?? null
                : null,
    };

    return <BrainClientPage initialPage={initialPage} initialAskOpen={resolvedSearchParams?.ask === "1"} />;
}
