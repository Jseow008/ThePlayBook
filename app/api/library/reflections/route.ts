import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { captureServerAnalyticsEvent } from "@/lib/server/analytics";
import { apiError, getRequestId, logApiError } from "@/lib/server/api";
import { rateLimit } from "@/lib/server/rate-limit";
import type { Database } from "@/types/database";

const REFLECTION_MAX_LENGTH = 1_000;
const PROMPT_MAX_LENGTH = 500;

const SaveReflectionSchema = z.object({
    content_item_id: z.string().uuid(),
    prompt: z.string().trim().min(1).max(PROMPT_MAX_LENGTH),
    reflection_text: z.string().trim().min(1).max(REFLECTION_MAX_LENGTH),
});

type ReflectionRow = Database["public"]["Tables"]["user_reflections"]["Row"];
type ReflectionInsert = Database["public"]["Tables"]["user_reflections"]["Insert"];

export async function GET(request: NextRequest) {
    const requestId = getRequestId();

    try {
        const supabase = await createClient();
        const { data: { user } } = await supabase.auth.getUser();

        if (!user) {
            return apiError("UNAUTHORIZED", "Must be logged in to view reflections.", 401, requestId);
        }

        const contentItemId = request.nextUrl.searchParams.get("content_item_id");
        let query = supabase
            .from("user_reflections")
            .select("id, content_item_id, prompt, reflection_text, created_at, updated_at, content_item ( id, title, author, cover_image_url )")
            .eq("user_id", user.id)
            .order("created_at", { ascending: false });

        if (contentItemId) {
            const parsedContentId = z.string().uuid().safeParse(contentItemId);
            if (!parsedContentId.success) {
                return apiError("VALIDATION_ERROR", "Invalid content item.", 400, requestId);
            }
            query = query.eq("content_item_id", parsedContentId.data);
        }

        const { data, error } = await query;
        if (error) {
            logApiError({ requestId, route: "GET /api/library/reflections", message: "Error loading reflections", error, userId: user.id });
            return apiError("INTERNAL_ERROR", "Failed to load reflections.", 500, requestId);
        }

        return NextResponse.json({ data: data ?? [] });
    } catch (error) {
        logApiError({ requestId, route: "GET /api/library/reflections", message: "Unexpected error loading reflections", error });
        return apiError("INTERNAL_ERROR", "Failed to load reflections.", 500, requestId);
    }
}

export async function POST(request: NextRequest) {
    const requestId = getRequestId();
    const rateLimitResult = await rateLimit(request, { limit: 12, windowMs: 60_000 });
    if (!rateLimitResult.success) {
        return NextResponse.json(
            { error: { code: "RATE_LIMITED", message: "Too many reflection saves." } },
            { status: 429, headers: { "Retry-After": String(Math.ceil((rateLimitResult.retryAfterMs ?? 60_000) / 1000)) } }
        );
    }

    try {
        const supabase = await createClient();
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) {
            return apiError("UNAUTHORIZED", "Sign in to save your reflection.", 401, requestId);
        }

        const parsed = SaveReflectionSchema.safeParse(await request.json().catch(() => null));
        if (!parsed.success) {
            return apiError("VALIDATION_ERROR", "Write a reflection of up to 1,000 characters.", 400, requestId);
        }

        const payload: ReflectionInsert = {
            user_id: user.id,
            content_item_id: parsed.data.content_item_id,
            prompt: parsed.data.prompt,
            reflection_text: parsed.data.reflection_text,
            updated_at: new Date().toISOString(),
        };
        const { data, error } = await supabase
            .from("user_reflections")
            .upsert([payload] as never, { onConflict: "user_id,content_item_id" })
            .select()
            .single();

        if (error) {
            logApiError({ requestId, route: "POST /api/library/reflections", message: "Error saving reflection", error, userId: user.id });
            return apiError("INTERNAL_ERROR", "Failed to save reflection.", 500, requestId);
        }

        const reflection = data as ReflectionRow;
        await captureServerAnalyticsEvent({
            event: "reflection_saved",
            distinctId: user.id,
            insertId: `reflection_saved:${user.id}:${reflection.id}:${reflection.updated_at ?? ""}`,
            properties: {
                content_id: parsed.data.content_item_id,
                reflection_length: parsed.data.reflection_text.length,
                route: "/read/[id]",
                user_state: "authenticated",
            },
        });

        return NextResponse.json({ data: reflection });
    } catch (error) {
        logApiError({ requestId, route: "POST /api/library/reflections", message: "Unexpected error saving reflection", error });
        return apiError("INTERNAL_ERROR", "Failed to save reflection.", 500, requestId);
    }
}
