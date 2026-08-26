import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  isOnboardingTopicKey,
  ONBOARDING_TOPIC_MAX_SELECTIONS,
  ONBOARDING_TOPIC_MIN_SELECTIONS,
} from "@/lib/onboarding-topics";
import { createClient } from "@/lib/supabase/server";
import { apiError, getRequestId, logApiError } from "@/lib/server/api";
import {
  getOnboardingTopicPreferences,
  replaceOnboardingTopicPreferences,
} from "@/lib/server/user-topic-preferences-repository";

const PreferencesSchema = z.object({
  topicKeys: z
    .array(z.string())
    .min(ONBOARDING_TOPIC_MIN_SELECTIONS)
    .max(ONBOARDING_TOPIC_MAX_SELECTIONS),
});

export async function GET() {
  const requestId = getRequestId();
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user)
    return apiError(
      "UNAUTHORIZED",
      "Must be logged in to read preferences.",
      401,
      requestId,
    );

  const { data, error } = await getOnboardingTopicPreferences(
    supabase,
    user.id,
  );

  if (error) {
    logApiError({
      requestId,
      route: "GET /api/onboarding/preferences",
      message: "Failed to load topic preferences",
      error,
      userId: user.id,
    });
    return apiError(
      "INTERNAL_ERROR",
      "Unable to load preferences.",
      500,
      requestId,
    );
  }

  return NextResponse.json({ topicKeys: data.map((row) => row.topic_key) });
}

export async function PUT(request: NextRequest) {
  const requestId = getRequestId();
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user)
    return apiError(
      "UNAUTHORIZED",
      "Must be logged in to save preferences.",
      401,
      requestId,
    );

  const parsed = PreferencesSchema.safeParse(
    await request.json().catch(() => null),
  );
  if (
    !parsed.success ||
    new Set(parsed.data.topicKeys).size !== parsed.data.topicKeys.length ||
    !parsed.data.topicKeys.every(isOnboardingTopicKey)
  ) {
    return apiError(
      "VALIDATION_ERROR",
      "Choose between three and five supported topics.",
      400,
      requestId,
    );
  }

  const { error: insertError } = await replaceOnboardingTopicPreferences(
    supabase,
    user.id,
    parsed.data.topicKeys,
  );

  if (insertError) {
    logApiError({
      requestId,
      route: "PUT /api/onboarding/preferences",
      message: "Failed to create topic preferences",
      error: insertError,
      userId: user.id,
    });
    return apiError(
      "INTERNAL_ERROR",
      "Unable to save preferences.",
      500,
      requestId,
    );
  }

  return NextResponse.json({ topicKeys: parsed.data.topicKeys });
}
