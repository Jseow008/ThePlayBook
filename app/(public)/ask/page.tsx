import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { AskClientPage } from "./client-page";

export const metadata = {
    title: "Ask My Library - Notes",
    description: "Ask questions and get answers based on the books in your personal library.",
};

interface AskPageProps {
    searchParams?: Promise<{
        returnTo?: string;
    }>;
}

export default async function AskPage({ searchParams }: AskPageProps) {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    const resolvedSearchParams = await searchParams;
    const returnTo = resolvedSearchParams?.returnTo;

    if (!user) {
        redirect("/login?next=/ask");
    }

    return <AskClientPage returnTo={returnTo} />;
}
