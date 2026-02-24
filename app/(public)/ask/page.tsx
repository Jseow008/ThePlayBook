import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { AskClientPage } from "./client-page";

export const metadata = {
    title: "Ask My Library - Notes",
    description: "Ask questions and get answers based on the books in your personal library.",
};

export default async function AskPage() {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
        redirect("/login?next=/ask");
    }

    return <AskClientPage />;
}
