import { createClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    try {
        const body = await req.json();
        const { duration_seconds = 60, activity_date } = body;
        const durationToAdd = Number(duration_seconds);

        // Use client provided date or fallback to server UTC today
        const today = activity_date || new Date().toISOString().split('T')[0];

        // Upsert logic:
        // If row exists for (user_id, activity_date), increment duration_seconds
        // Else insert new row

        // Unfortunately Supabase/Postgres upsert simple 'ON CONFLICT DO UPDATE' is tricky with the JS client 
        // for incrementing values without a raw RPC or two steps.
        // We will try a raw RPC call or a select-then-update approach for simplicity first, 
        // but raw SQL is better for concurrency.

        // Let's try to check if a row exists first.
        const { data: existing } = await (supabase
            .from('reading_activity') as any)
            .select('id, duration_seconds')
            .eq('user_id', user.id)
            .eq('activity_date', today)
            .single();

        if (existing) {
            const { error } = await (supabase
                .from('reading_activity') as any)
                .update({
                    duration_seconds: (existing.duration_seconds || 0) + durationToAdd,
                    updated_at: new Date().toISOString()
                })
                .eq('id', existing.id);

            if (error) throw error;
        } else {
            const { error } = await (supabase
                .from('reading_activity') as any)
                .insert({
                    user_id: user.id,
                    activity_date: today,
                    duration_seconds: durationToAdd
                });

            if (error) throw error;
        }

        return NextResponse.json({ success: true });
    } catch (error) {
        console.error("Failed to log activity", error);
        return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
    }
}
