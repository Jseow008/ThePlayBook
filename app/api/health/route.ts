import { NextResponse } from "next/server";
import { createPublicServerClient } from "@/lib/supabase/public-server";

export async function GET() {
    try {
        const supabase = createPublicServerClient();
        const { error } = await supabase
            .from("content_item")
            .select("id")
            .limit(1);

        if (error) {
            return NextResponse.json(
                {
                    status: "degraded",
                    database: "unreachable",
                    timestamp: new Date().toISOString(),
                },
                { status: 503 }
            );
        }

        return NextResponse.json({
            status: "ok",
            database: "reachable",
            timestamp: new Date().toISOString(),
        });
    } catch {
        return NextResponse.json(
            {
                status: "degraded",
                database: "unreachable",
                timestamp: new Date().toISOString(),
            },
            { status: 503 }
        );
    }
}
