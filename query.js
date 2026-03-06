/* eslint-disable @typescript-eslint/no-require-imports */
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.log("Supabase credentials not found in env.");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function checkData() {
  const { data, error } = await supabase
    .from("content_item")
    .select("id, title, status, deleted_at, is_featured")
    .eq("status", "verified")
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .limit(10);
    
  if (error) {
    console.error("Error fetching:", error);
  } else {
    console.log(`Found ${data.length} items`);
    console.log(JSON.stringify(data, null, 2));
  }
}

checkData();
