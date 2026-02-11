import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
    console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_KEY");
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey, {
    auth: {
        persistSession: false,
        autoRefreshToken: false,
    },
});

async function setupAudio() {
    console.log("Setting up audio bucket...");

    const { data: buckets, error: listError } = await supabase.storage.listBuckets();
    if (listError) {
        console.error("Failed to list buckets:", listError.message);
        process.exit(1);
    }

    const hasAudioBucket = (buckets ?? []).some((bucket) => bucket.name === "audio");
    if (hasAudioBucket) {
        console.log("Audio bucket already exists.");
        return;
    }

    const { error: createError } = await supabase.storage.createBucket("audio", {
        public: true,
        fileSizeLimit: 50 * 1024 * 1024,
        allowedMimeTypes: ["audio/mpeg", "audio/mp3", "audio/wav", "audio/x-m4a", "audio/m4a", "audio/mp4"],
    });

    if (createError) {
        console.error("Failed to create audio bucket:", createError.message);
        process.exit(1);
    }

    console.log("Created audio bucket.");
    console.log("Schema and policy changes are managed via Supabase migrations in supabase/migrations.");
}

setupAudio();
