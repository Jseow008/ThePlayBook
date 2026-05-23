import { RequestBoard } from "@/components/requests/RequestBoard";
import { fetchUserRequestVoteIds, fetchUserSubmittedRequestIds, fetchVisibleContentRequests } from "@/lib/server/content-requests";
import { createClient } from "@/lib/supabase/server";
import { resolveAuthUserResult } from "@/lib/supabase/auth-errors";
import type { ContentType } from "@/types/database";

export const dynamic = "force-dynamic";

const REQUESTABLE_TYPES: ContentType[] = ["book", "video"];

function normalizeRequestType(value?: string): ContentType {
    const normalized = value?.toLowerCase() as ContentType | undefined;
    return normalized && REQUESTABLE_TYPES.includes(normalized) ? normalized : "book";
}

export default async function RequestsPage({
    searchParams,
}: {
    searchParams?: Promise<{ prefill?: string; type?: string }>;
}) {
    const resolvedSearchParams = await searchParams;
    const supabase = await createClient();
    const authResult = await supabase.auth.getUser();
    const { user } = resolveAuthUserResult(authResult);

    const [requests, voteIds, submittedIds] = await Promise.all([
        fetchVisibleContentRequests(),
        user ? fetchUserRequestVoteIds(user.id) : Promise.resolve(new Set<string>()),
        user ? fetchUserSubmittedRequestIds(user.id) : Promise.resolve(new Set<string>()),
    ]);

    return (
        <RequestBoard
            initialRequests={requests}
            initialVotedIds={Array.from(voteIds)}
            initialSubmittedIds={Array.from(submittedIds)}
            initialInput={resolvedSearchParams?.prefill ?? ""}
            initialContentType={normalizeRequestType(resolvedSearchParams?.type)}
        />
    );
}
