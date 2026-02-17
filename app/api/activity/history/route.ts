import { createClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";

export async function GET(req: NextRequest) {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    try {
        const url = new URL(req.url);
        const start = url.searchParams.get('start'); // YYYY-MM-DD
        const end = url.searchParams.get('end');     // YYYY-MM-DD

        // Basic query
        let query = supabase
            .from('reading_activity')
            .select('activity_date, duration_seconds, pages_read')
            .eq('user_id', user.id)
            .order('activity_date', { ascending: true });

        if (start) {
            query = query.gte('activity_date', start);
        }
        if (end) {
            query = query.lte('activity_date', end);
        }

        const { data, error } = await query;

        if (error) throw error;

        return NextResponse.json(data);
    } catch (error) {
        console.error("Failed to fetch reading history", error);
        return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
    }
}
