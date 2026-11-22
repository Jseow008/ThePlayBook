import { RequestBoard } from "@/components/requests/RequestBoard";

import { isRequestFormat } from "@/lib/content-requests";

export const dynamic = "force-dynamic";

export default async function RequestsPage({
    searchParams,
}: {
    searchParams?: Promise<{ prefill?: string; type?: string }>;
}) {
    const resolvedSearchParams = await searchParams;

    const type = resolvedSearchParams?.type;
    const initialType = isRequestFormat(type) ? type : "";

    return (
        <RequestBoard
            key={JSON.stringify([resolvedSearchParams?.prefill, initialType])}
            initialType={initialType}
            initialInput={resolvedSearchParams?.prefill ?? ""}
        />
    );
}
