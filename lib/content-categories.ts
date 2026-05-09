export const CONTENT_CATEGORY_ALIASES = {
    Christian: "Religion & Spirituality",
    Finance: "Money & Investments",
    Health: "Health & Nutrition",
    Mindset: "Personal Development",
    Parenthood: "Parenting",
    Pregnancy: "Parenting",
    "Money & Finance": "Money & Investments",
    "Science & Learning": "Science",
    Technology: "Technology & the Future",
    Wealth: "Money & Investments",
} as const;

export const CANONICAL_CONTENT_CATEGORIES = [
    "Business",
    "Entrepreneurship",
    "Management & Leadership",
    "Career & Success",
    "Marketing & Sales",
    "Communication Skills",
    "Corporate Culture",
    "Economics",
    "Money & Investments",
    "Productivity",
    "Personal Development",
    "Motivation & Inspiration",
    "Psychology",
    "Philosophy",
    "Religion & Spirituality",
    "Relationships",
    "Parenting",
    "Health & Nutrition",
    "Fitness",
    "Science",
    "Technology & the Future",
    "Education",
    "Society & Culture",
    "Politics",
    "History",
    "Nature & the Environment",
    "Lifestyle",
] as const;

export const CURATED_SEARCH_TOPICS = [
    "Business",
    "Money & Investments",
    "Personal Development",
    "Productivity",
    "Health & Nutrition",
    "Parenting",
    "Psychology",
] as const;

export const CURATED_LANDING_CATEGORY_ORDER = [
    "Personal Development",
    "Health & Nutrition",
    "Parenting",
    "Money & Investments",
    "Productivity",
    "Philosophy",
    "Business",
    "Science",
    "Psychology",
    "Religion & Spirituality",
    "Relationships",
    "Technology & the Future",
    "Politics",
    "Lifestyle",
] as const;

export function normalizeContentCategoryLabel(category?: string | null) {
    const trimmed = category?.trim() ?? "";
    if (!trimmed) return "";

    if (trimmed.startsWith("'") && trimmed.endsWith("'") && trimmed.length > 1) {
        return trimmed.slice(1, -1).trim();
    }

    return trimmed;
}

export function resolveContentCategoryAlias(category?: string | null) {
    const normalized = normalizeContentCategoryLabel(category);
    return CONTENT_CATEGORY_ALIASES[normalized as keyof typeof CONTENT_CATEGORY_ALIASES];
}

export function getCanonicalContentCategory(category?: string | null) {
    const normalized = normalizeContentCategoryLabel(category);
    return resolveContentCategoryAlias(normalized) ?? normalized;
}

export function buildCanonicalCategoryStats(categoryStats: Array<{ category: string; count: number }>) {
    const categoryMap = new Map<string, { count: number; rawValues: Set<string> }>();

    for (const item of categoryStats) {
        const rawLabel = item.category?.trim();
        const canonicalLabel = getCanonicalContentCategory(rawLabel);

        if (!canonicalLabel || !rawLabel) continue;

        const existing = categoryMap.get(canonicalLabel) ?? {
            count: 0,
            rawValues: new Set<string>(),
        };

        existing.count += item.count;
        existing.rawValues.add(rawLabel);

        if (canonicalLabel !== normalizeContentCategoryLabel(rawLabel)) {
            existing.rawValues.add(canonicalLabel);
        }

        categoryMap.set(canonicalLabel, existing);
    }

    return Array.from(categoryMap.entries()).map(([category, value]) => ({
        category,
        count: value.count,
        rawValues: Array.from(value.rawValues).sort((a, b) => a.localeCompare(b)),
    }));
}
