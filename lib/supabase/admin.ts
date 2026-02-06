import { createClient } from '@supabase/supabase-js';

// Note: SUPABASE_SERVICE_KEY should be in .env.local
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_KEY!;

if (!supabaseUrl || !supabaseServiceKey) {
    console.warn('Missing Supabase environment variables for admin client');
}

export const adminClient = createClient(supabaseUrl, supabaseServiceKey, {
    auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
    },
});

export const getAdminClient = () => adminClient;

