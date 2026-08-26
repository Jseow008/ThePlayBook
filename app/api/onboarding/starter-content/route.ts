import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  getTopicCategoryValues,
  isOnboardingTopicKey,
} from "@/lib/onboarding-topics";
import { createPublicServerClient } from "@/lib/supabase/public-server";
import { apiError, getRequestId, logApiError } from "@/lib/server/api";

const QuerySchema = z.object({ topics: z.string().min(1) });
const CONTENT_SELECT = "id, title, author, category, cover_image_url, type";

export async function GET(request: NextRequest) {
  const requestId = getRequestId();
  const parsed = QuerySchema.safeParse({
    topics: request.nextUrl.searchParams.get("topics") ?? "",
  });
  const topicKeys = parsed.success
    ? Array.from(
        new Set(parsed.data.topics.split(",").filter(isOnboardingTopicKey)),
      )
    : [];

  if (topicKeys.length === 0)
    return apiError(
      "VALIDATION_ERROR",
      "Select supported topics.",
      400,
      requestId,
    );

  const categories = getTopicCategoryValues(topicKeys);
  const { data, error } = await createPublicServerClient()
    .from("content_item")
    .select(CONTENT_SELECT)
    .eq("status", "verified")
    .is("deleted_at", null)
    .in("category", categories)
    .order("published_at", { ascending: false })
    .limit(12);

  if (error) {
    logApiError({
      requestId,
      route: "GET /api/onboarding/starter-content",
      message: "Failed to load starter content",
      error,
    });
    return apiError(
      "INTERNAL_ERROR",
      "Unable to load starter content.",
      500,
      requestId,
    );
  }

  return NextResponse.json(
    { items: data ?? [] },
    { headers: { "Cache-Control": "private, no-store" } },
  );
}
