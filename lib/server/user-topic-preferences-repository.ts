/**
 * User topic preference repository.
 *
 * The table has a composite primary key (`user_id`, `topic_key`). Supabase-js
 * cannot currently infer its shape through the regular `.from()` chain, so the
 * narrow cast stays at this boundary rather than leaking into routes/pages.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";

type UserTopicPreferenceRow =
  Database["public"]["Tables"]["user_topic_preferences"]["Row"];
type UserTopicPreferenceInsert =
  Database["public"]["Tables"]["user_topic_preferences"]["Insert"];
type TypedSupabaseClient = SupabaseClient<any, any, any>;

const userTopicPreferencesTable = (client: TypedSupabaseClient) =>
  client.from("user_topic_preferences") as any;

export async function getOnboardingTopicPreferences(
  client: TypedSupabaseClient,
  userId: string,
): Promise<{ data: UserTopicPreferenceRow[]; error: Error | null }> {
  const { data, error } = await userTopicPreferencesTable(client)
    .select("topic_key")
    .eq("user_id", userId)
    .eq("source", "onboarding");

  return { data: (data ?? []) as UserTopicPreferenceRow[], error };
}

export async function replaceOnboardingTopicPreferences(
  client: TypedSupabaseClient,
  userId: string,
  topicKeys: UserTopicPreferenceInsert["topic_key"][],
): Promise<{ error: Error | null }> {
  const { error: deleteError } = await userTopicPreferencesTable(client)
    .delete()
    .eq("user_id", userId)
    .eq("source", "onboarding");

  if (deleteError) return { error: deleteError };

  const { error } = await userTopicPreferencesTable(client).insert(
    topicKeys.map((topic_key) => ({
      user_id: userId,
      topic_key,
      source: "onboarding",
    })),
  );

  return { error };
}
