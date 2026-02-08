

// Load .env.local via --env-file flag
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
    console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_KEY");
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function setupAudio() {
    console.log("🚀 Setting up Audio functionality...");

    // 1. Create 'audio' bucket
    console.log("creating audio bucket...");
    const { data: bucket, error: bucketError } = await supabase
        .storage
        .createBucket("audio", {
            public: true,
            fileSizeLimit: 52428800, // 50MB
            allowedMimeTypes: ["audio/mpeg", "audio/mp3", "audio/wav", "audio/x-m4a"]
        });

    if (bucketError) {
        if (bucketError.message.includes("already exists")) {
            console.log("✅ 'audio' bucket already exists.");
        } else {
            console.error("❌ Error creating bucket:", bucketError.message);
        }
    } else {
        console.log("✅ Created 'audio' bucket.");
    }

    // 2. Add 'audio_url' column via raw SQL using Postgres connection?
    // Supabase-js doesn't support DDL (CREATE/ALTER TABLE) directly via client unless using an RPC with elevated privileges.
    // BUT we can use the SQL Editor API if available, or just instruct the user.
    // Actually, we can use the `postgres` package if we had the connection string, but we only have URL/Key.
    // Alternatively: We can just Log the SQL for the user to run.

    console.log("\n⚠️ IMPORTANT: You must run the following SQL in your Supabase Dashboard SQL Editor:");
    console.log(`
    -- Add audio_url column if it doesn't exist
    ALTER TABLE content ADD COLUMN IF NOT EXISTS audio_url TEXT;

    -- Update types (you'll need to do this in your local types/domain.ts)
  `);

}

setupAudio();
