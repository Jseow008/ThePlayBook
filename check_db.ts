import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";

const supabase = createClient(supabaseUrl, supabaseKey);

async function main() {
    const { data, error } = await supabase
        .from("content_item")
        .select("id, title, status, deleted_at, created_at")
        .eq("status", "verified")
        .is("deleted_at", null)
        .order("created_at", { ascending: false })
        .limit(10);

    if (error) {
        console.error("Error fetching:", error);
        return;
    }

    console.log("Returned row count:", data?.length);
    console.log(JSON.stringify(data, null, 2));
}

main();
