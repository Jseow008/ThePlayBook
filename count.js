const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

const supabase = createClient(supabaseUrl, supabaseKey);

async function checkTotalItems() {
  const { count, error } = await supabase
    .from("content_item")
    .select("*", { count: 'exact', head: true })
    .eq("status", "verified")
    .is("deleted_at", null);
    
  if (error) {
    console.error("Count Error:", error);
  } else {
    console.log(`Total verified items (no deleted_at): ${count}`);
  }
}

checkTotalItems();
