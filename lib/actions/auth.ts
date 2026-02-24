"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

export async function signOutAction() {
    const supabase = await createClient();

    // Server-side sign out effectively destroys the session and clears cookies
    await supabase.auth.signOut();

    // Clear any cached routes that depend on the user session
    revalidatePath("/", "layout");

    // Redirect to login page
    redirect("/login");
}
