import { buildCanonicalCategoryStats, CURATED_LANDING_CATEGORY_ORDER } from "@/lib/content-categories";

export function getCuratedCategories(categories: { category: string; count: number }[]) {
  const canonicalCategories = buildCanonicalCategoryStats(categories);
  const categoryMap = new Map(canonicalCategories.map((item) => [item.category, item]));
  return CURATED_LANDING_CATEGORY_ORDER.map((name) => categoryMap.get(name)).filter(
    (item): item is { category: string; count: number; rawValues: string[] } => Boolean(item)
  );
}
