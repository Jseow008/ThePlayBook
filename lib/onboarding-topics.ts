import { getContentCategoryRawValues } from "@/lib/content-categories";

export const ONBOARDING_TOPIC_MIN_SELECTIONS = 3;
export const ONBOARDING_TOPIC_MAX_SELECTIONS = 5;

export const ONBOARDING_TOPICS = [
  {
    key: "habits_productivity",
    label: "Habits & Productivity",
    categories: ["Personal Development", "Productivity"],
  },
  {
    key: "mindset_philosophy",
    label: "Mindset & Philosophy",
    categories: ["Personal Development", "Philosophy"],
  },
  {
    key: "wealth_investing",
    label: "Wealth & Investing",
    categories: ["Money & Investments"],
  },
  {
    key: "business_strategy",
    label: "Business & Strategy",
    categories: [
      "Business",
      "Entrepreneurship",
      "Management & Leadership",
      "Strategy",
    ],
  },
  {
    key: "ai_emerging_tech",
    label: "AI & Emerging Tech",
    categories: ["Technology & the Future", "Science and Technology"],
  },
  {
    key: "cognitive_science_brain",
    label: "Psychology & the Brain",
    categories: ["Psychology", "Science", "Behavioral Economics"],
  },
  {
    key: "human_behavior_social",
    label: "Human Behavior",
    categories: ["Psychology", "Relationships", "Lifestyle"],
  },
  {
    key: "health_longevity_nutrition",
    label: "Health & Longevity",
    categories: [
      "Health & Nutrition",
      "Fitness",
      "Medicine",
      "Health & Longevity",
    ],
  },
  {
    key: "science_universe",
    label: "Science & Discovery",
    categories: ["Science"],
  },
  {
    key: "spirituality_meaning",
    label: "Spirituality & Meaning",
    categories: ["Religion & Spirituality", "Philosophy & Religion"],
  },
] as const;

export type OnboardingTopicKey = (typeof ONBOARDING_TOPICS)[number]["key"];

const TOPIC_KEYS = new Set<string>(ONBOARDING_TOPICS.map((topic) => topic.key));

export function isOnboardingTopicKey(
  value: string,
): value is OnboardingTopicKey {
  return TOPIC_KEYS.has(value);
}

export function getTopicCategoryValues(topicKeys: readonly string[]) {
  const selectedTopics = ONBOARDING_TOPICS.filter((topic) =>
    topicKeys.includes(topic.key),
  );
  return Array.from(
    new Set(
      selectedTopics.flatMap((topic) =>
        topic.categories.flatMap((category) =>
          getContentCategoryRawValues(category),
        ),
      ),
    ),
  );
}
