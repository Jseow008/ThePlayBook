import { createPublicServerClient } from "@/lib/supabase/public-server";
import { NextRequest, NextResponse } from "next/server";

export async function POST(request: NextRequest) {
    try {
        const body = await request.json();
        const { completedIds } = body;

        if (!completedIds || !Array.isArray(completedIds) || completedIds.length === 0) {
            return NextResponse.json([], { status: 200 });
        }

        const supabase = createPublicServerClient();

        const { data, error } = await (supabase.rpc as any)("match_recommendations", {
            completed_ids: completedIds,
            match_count: 6,
        });

        if (error) {
            console.error("Recommendation error:", error);
            return NextResponse.json(
                { error: "Failed to get recommendations" },
                { status: 500 }
            );
        }

        return NextResponse.json(data || [], {
            headers: {
                "Cache-Control": "public, s-maxage=300, stale-while-revalidate=600",
            },
        });
    } catch {
        return NextResponse.json(
            { error: "Invalid request" },
            { status: 400 }
        );
    }
}
