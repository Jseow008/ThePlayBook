import "server-only";

import type { User } from "@supabase/supabase-js";
import {
  WELCOME_PERSONALIZATION_TOUR_KEY,
  WELCOME_PERSONALIZATION_VERSION,
  hasSeenOnboardingVersion,
} from "@/lib/onboarding";
import { normalizeLoginNextPath } from "@/lib/auth-redirect";
import type { createClient } from "@/lib/supabase/server";
import type { Database } from "@/types/database";

type ServerSupabaseClient = Awaited<ReturnType<typeof createClient>>;
type ProfileRow = Database["public"]["Tables"]["profiles"]["Row"];

export function buildWelcomePath(next: string) {
  return `/welcome?${new URLSearchParams({ next }).toString()}`;
}

export async function resolvePostAuthDestination(
  supabase: ServerSupabaseClient,
  user: Pick<User, "id">,
  next: string | null | undefined,
) {
  const normalizedNext = normalizeLoginNextPath(next);
  const { data, error } = await supabase
    .from("profiles")
    .select("onboarding_state")
    .eq("id", user.id)
    .maybeSingle();

  if (error) {
    console.error("Failed to load activation state", error);
    return normalizedNext;
  }

  const profile = data as unknown as Pick<
    ProfileRow,
    "onboarding_state"
  > | null;
  const hasCompletedActivation = hasSeenOnboardingVersion(
    profile?.onboarding_state ?? null,
    WELCOME_PERSONALIZATION_TOUR_KEY,
    WELCOME_PERSONALIZATION_VERSION,
  );

  return hasCompletedActivation
    ? normalizedNext
    : buildWelcomePath(normalizedNext);
}
