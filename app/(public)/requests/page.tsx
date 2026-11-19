import { RequestBoard } from "@/components/requests/RequestBoard";

export const dynamic = "force-dynamic";

export default async function RequestsPage({
    searchParams,
}: {
    searchParams?: Promise<{ prefill?: string; type?: string }>;
}) {
    const resolvedSearchParams = await searchParams;

    const type = resolvedSearchParams?.type;
    const initialType = type === "book" || type === "video" ? type : "";

    return (
        <RequestBoard
            key={JSON.stringify([resolvedSearchParams?.prefill, initialType])}
            initialType={initialType}
            initialInput={resolvedSearchParams?.prefill ?? ""}
        />
    );
}
