import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!; // or service role key if needed
const supabase = createClient(supabaseUrl, supabaseKey);

async function test() {
    const { error } = await supabase.rpc("increment_reading_activity", {
        p_activity_date: "2026-02-24",
        p_duration_seconds: 60,
    });
    console.log("Error:", error);
}

test();
