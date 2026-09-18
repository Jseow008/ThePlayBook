import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { AskClientPage } from "./client-page";
import { buildLoginHref } from "@/lib/auth-redirect";
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
        const loginTargetParams = new URLSearchParams();

        if (scope === "notes") {
            loginTargetParams.set("scope", "notes");
        }

        if (resolvedSearchParams?.notesScope) {
            loginTargetParams.set("notesScope", resolvedSearchParams.notesScope);
        }

        if (returnTo) {
            loginTargetParams.set("returnTo", returnTo);
        }

        const loginTarget = loginTargetParams.size > 0
            ? `/ask?${loginTargetParams.toString()}`
            : "/ask";

        redirect(buildLoginHref(loginTarget));
    }

    if (resolvedSearchParams?.notesScope && !initialNotesScope) {
        // Old ID-only links must not silently become an account-wide scope.
        redirect("/notes?ask=1&restart=1");
    }

    let initialLibrarySnapshot: LibrarySnapshot | undefined;

    const libraryPromise = supabase
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
    const { data: libraryRows, error: libraryError } = await libraryPromise;

    if (libraryError) {
        console.error("Failed to load ask library snapshot:", libraryError);
    } else {
        initialLibrarySnapshot = buildLibrarySnapshot((libraryRows || []) as LibraryItemRow[]);
    }


    return (
        <AskClientPage
            returnTo={returnTo}
            scope={scope}
            initialNotesScope={initialNotesScope ?? undefined}
            initialLibrarySnapshot={initialLibrarySnapshot}
            initialAccountId={user.id}
        />
    );
}
