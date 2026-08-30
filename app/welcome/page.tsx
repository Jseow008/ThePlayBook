import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { WelcomeActivation } from "@/components/ui/WelcomeActivation";
import type { OnboardingTopicKey } from "@/lib/onboarding-topics";
import { isOnboardingTopicKey } from "@/lib/onboarding-topics";
import { resolveAuthUserResult } from "@/lib/supabase/auth-errors";
import { normalizeLoginNextPath } from "@/lib/auth-redirect";
import { APP_NAME } from "@/lib/brand";
import { createClient } from "@/lib/supabase/server";
import { resolvePostAuthDestination } from "@/lib/auth-activation";
import { getOnboardingTopicPreferences } from "@/lib/server/user-topic-preferences-repository";

export const metadata: Metadata = {
  title: `Welcome - ${APP_NAME}`,
  robots: { index: false, follow: false },
};

export default async function WelcomePage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string | string[] }>;
}) {
  const params = await searchParams;
  const requestedNext = normalizeLoginNextPath(
    typeof params.next === "string" ? params.next : undefined,
  );
  const supabase = await createClient();
  const { user } = resolveAuthUserResult(await supabase.auth.getUser());

  if (!user) {
    redirect(`/login?next=${encodeURIComponent("/welcome")}`);
  }

  const destination = await resolvePostAuthDestination(
    supabase,
    user,
    requestedNext,
  );
  if (destination === requestedNext) {
    redirect(requestedNext);
  }

  const { data: preferences, error } = await getOnboardingTopicPreferences(
    supabase,
    user.id,
  );

  if (error) {
    console.error("Failed to load welcome topic preferences", error);
  }

  const initialTopicKeys = (preferences ?? [])
    .map((preference) => preference.topic_key)
    .filter(isOnboardingTopicKey) as OnboardingTopicKey[];

  return (
    <WelcomeActivation
      nextUrl={requestedNext}
      initialTopicKeys={initialTopicKeys}
    />
  );
}
