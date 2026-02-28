import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { BrainClientPage } from "./client-page";

export const metadata = {
    title: "Notes",
    description: "Manage your highlights, notes, and personal knowledge base.",
};

export default async function BrainPage() {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
        redirect("/login?next=/notes");
    }

    // Pre-fetch global highlights
    const { data: highlights, error } = await supabase
        .from("user_highlights")
        .select(`
            id,
            highlighted_text,
            note_body,
            color,
            created_at,
            content_item ( id, title, author, cover_image_url )
        `)
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(30);

    if (error) {
        console.error("Failed to load brain highlights:", error);
    }

    return <BrainClientPage initialHighlights={highlights || []} />;
}
