import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET() {
    try {
        const supabase = await createClient();
        const { error } = await supabase
            .from("content_item")
            .select("id", { head: true, count: "exact" })
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
