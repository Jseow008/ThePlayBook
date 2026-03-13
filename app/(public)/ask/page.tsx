import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { AskClientPage } from "./client-page";
import type { HighlightsPage } from "@/hooks/useHighlights";
import { buildLibrarySnapshot, type LibraryItemRow, type LibrarySnapshot } from "@/lib/server/library-snapshot";
import { parseNotesChatScope } from "@/lib/notes-chat-scope";

export const metadata = {
    title: "Ask",
    description: "Ask questions across your library or your saved notes.",
};

interface AskPageProps {
    searchParams?: Promise<{
        returnTo?: string;
        scope?: string;
        notesScope?: string;
    }>;
}

export default async function AskPage({ searchParams }: AskPageProps) {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    const resolvedSearchParams = await searchParams;
    const returnTo = resolvedSearchParams?.returnTo;
    const scope = resolvedSearchParams?.scope === "notes" ? "notes" : "library";
    const initialNotesScope = parseNotesChatScope(resolvedSearchParams?.notesScope);

    if (!user) {
        redirect("/login?next=/ask");
    }

    let initialNotesPage: HighlightsPage | undefined;
    let initialLibrarySnapshot: LibrarySnapshot | undefined;

    const { data: libraryRows, error: libraryError } = await supabase
        .from("user_library")
        .select(`
            content_id,
            is_bookmarked,
            progress,
            last_interacted_at,
            content_item ( title, author )
        `)
        .eq("user_id", user.id)
        .order("last_interacted_at", { ascending: false });

    if (libraryError) {
        console.error("Failed to load ask library snapshot:", libraryError);
    } else {
        initialLibrarySnapshot = buildLibrarySnapshot((libraryRows || []) as LibraryItemRow[]);
    }

    if (scope === "notes" && !initialNotesScope) {
        const { data: highlights, error } = await supabase
            .from("user_highlights")
            .select(`
                id,
                user_id,
                content_item_id,
                segment_id,
                anchor_start,
                anchor_end,
                highlighted_text,
                note_body,
                color,
                created_at,
                updated_at,
                content_item ( id, title, author, cover_image_url ),
                segment ( id, title )
            `)
            .eq("user_id", user.id)
            .order("created_at", { ascending: false })
            .limit(30);

        if (error) {
            console.error("Failed to load ask notes highlights:", error);
        }

        initialNotesPage = {
            data: (highlights || []) as HighlightsPage["data"],
            nextCursor:
                highlights && highlights.length === 30
                    ? (highlights[highlights.length - 1] as { created_at?: string | null })?.created_at ?? null
                    : null,
        };
    }

    return (
        <AskClientPage
            returnTo={returnTo}
            scope={scope}
            initialNotesPage={initialNotesPage}
            initialNotesScope={initialNotesScope ?? undefined}
            initialLibrarySnapshot={initialLibrarySnapshot}
        />
    );
}
