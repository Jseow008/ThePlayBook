import { createClient } from "@supabase/supabase-js";

// Load environment variables (via --env-file)


const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
    console.error("Missing Supabase credentials in .env.local");
    process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

async function debugRecommendations() {
    console.log("--- Debugging Recommendations ---");

    // 1. Check user_library data (limit 5 most recent across all users)
    const { data: libraryData, error: libraryError } = await supabase
        .from("user_library")
        .select(`
            user_id,
            content_id, 
            last_interacted_at,
            content_item (
                id, 
                title, 
                category
            )
        `)
        .order("last_interacted_at", { ascending: false })
        .limit(5);

    if (libraryError) {
        console.error("Error fetching user_library:", libraryError);
        return;
    }

    if (!libraryData || libraryData.length === 0) {
        console.log("No data found in user_library table.");
        return;
    }

    console.log(`Found ${libraryData.length} recent interactions:`);

    for (const item of libraryData) {
        const contentItem = item.content_item;
        console.log(`\nUser: ${item.user_id}`);
        console.log(`Last Interacted: ${item.last_interacted_at}`);

        if (!contentItem) {
            console.log(`WARNING: Content item not found (joined data missing) for ID: ${item.content_id}`);
            continue;
        }

        console.log(`Content: "${contentItem.title}"`);
        console.log(`Category: "${contentItem.category}"`);

        if (!contentItem.category) {
            console.log("WARNING: Content has no category - cannot generate recommendations.");
            continue;
        }

        // 2. Check for recommendations for this category
        const { data: recs, error: recsError } = await supabase
            .from("content_item")
            .select("title")
            .eq("category", contentItem.category)
            .neq("id", contentItem.id)
            .limit(5);

        if (recsError) {
            console.error("Error fetching recommendations:", recsError);
        } else if (recs && recs.length > 0) {
            console.log(`Found ${recs.length} potential recommendations:`, recs.map(r => r.title));
        } else {
            console.log("No recommendations found in this category.");
        }
    }
}

debugRecommendations();
