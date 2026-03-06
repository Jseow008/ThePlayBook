const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

const supabase = createClient(supabaseUrl, supabaseKey);

async function checkData() {
  const { data, error } = await supabase
    .from("content_item")
    .select("title")
    .eq("status", "verified")
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .limit(10);
    
  if (error) {
    console.error("Error:", error);
  } else {
    console.log(`Query returned ${data.length} items.`);
    if (data.length > 0) {
      console.log(data.map(d => d.title).join('\n'));
    }
  }
}

checkData();
