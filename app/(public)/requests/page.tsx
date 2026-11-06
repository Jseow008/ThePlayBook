import { RequestBoard } from "@/components/requests/RequestBoard";

export const dynamic = "force-dynamic";

export default async function RequestsPage({
    searchParams,
}: {
    searchParams?: Promise<{ prefill?: string; type?: string }>;
}) {
    const resolvedSearchParams = await searchParams;

    return (
        <RequestBoard
            initialInput={resolvedSearchParams?.prefill ?? ""}
        />
    );
}
