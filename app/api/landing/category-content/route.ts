import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
    getCanonicalContentCategory,
    getContentCategoryRawValues,
} from "@/lib/content-categories";
import { createPublicServerClient } from "@/lib/supabase/public-server";
import { rateLimitFailureResponse, strictPublicRateLimit } from "@/lib/server/rate-limit";

const CategoryQuerySchema = z.object({
    category: z.string().trim().min(1).max(80),
    values: z.array(z.string().trim().min(1).max(80)).max(20),
});

const LANDING_CATEGORY_SELECT =
    "id, type, title, author, cover_image_url, hero_image_url, category, duration_seconds, audio_url, created_at, is_featured";

export async function GET(request: NextRequest) {
    const rl = await strictPublicRateLimit(request, {
        limit: 30,
        windowMs: 60_000,
        routeLabel: "/api/landing/category-content",
    });

    if (!rl.success) {
        return rateLimitFailureResponse(rl, "Too many requests.");
    }

    const parsed = CategoryQuerySchema.safeParse({
        category: request.nextUrl.searchParams.get("category"),
        values: request.nextUrl.searchParams.getAll("value"),
    });

    if (!parsed.success) {
        return NextResponse.json({ error: "A valid category is required." }, { status: 400 });
    }

    const canonicalCategory = getCanonicalContentCategory(parsed.data.category);
    const suppliedRawValues = parsed.data.values.filter(
        (value) => getCanonicalContentCategory(value) === canonicalCategory
    );
    const categoryValues = Array.from(new Set([
        ...getContentCategoryRawValues(canonicalCategory),
        ...suppliedRawValues,
    ]));
    const supabase = createPublicServerClient();
    const { data, error } = await supabase
        .from("content_item")
        .select(LANDING_CATEGORY_SELECT)
        .in("category", categoryValues)
        .eq("status", "verified")
        .is("deleted_at", null)
        .order("is_featured", { ascending: false })
        .order("created_at", { ascending: false })
        .limit(16);

    if (error) {
        console.error("Landing category content fetch failed:", error);
        return NextResponse.json({ error: "Failed to fetch category content." }, { status: 500 });
    }

    return NextResponse.json(
        { items: data ?? [] },
        {
            headers: {
                "Cache-Control": "public, s-maxage=300, stale-while-revalidate=3600",
            },
        }
    );
}
