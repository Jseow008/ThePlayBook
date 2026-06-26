import { RequestBoard } from "@/components/requests/RequestBoard";
import type { ContentType } from "@/types/database";

export const dynamic = "force-dynamic";

const REQUESTABLE_TYPES: ContentType[] = ["book", "video"];

function normalizeRequestType(value?: string): ContentType | undefined {
    const normalized = value?.toLowerCase() as ContentType | undefined;
    return normalized && REQUESTABLE_TYPES.includes(normalized) ? normalized : undefined;
}

export default async function RequestsPage({
    searchParams,
}: {
    searchParams?: Promise<{ prefill?: string; type?: string }>;
}) {
    const resolvedSearchParams = await searchParams;

    return (
        <RequestBoard
            initialInput={resolvedSearchParams?.prefill ?? ""}
            initialContentType={normalizeRequestType(resolvedSearchParams?.type)}
        />
    );
}
