export const CONTENT_CATEGORY_ALIASES = {
    Christian: "Religion & Spirituality",
    Finance: "Money & Investments",
    Health: "Health & Nutrition",
    Mindset: "Personal Development",
    Parenthood: "Parenting",
    Pregnancy: "Parenting",
    "Money & Finance": "Money & Investments",
    "Science & Learning": "Science",
    "Science and Technology": "Science & Technology",
    "Decision Making": "Decision-Making",
    "Self-help": "Self-Help",
    Technology: "Technology & the Future",
    Wealth: "Money & Investments",
} as const;

export const CANONICAL_CONTENT_CATEGORIES = [
    "Biography & Memoir",
    "Business",
    "Careers & Work",
    "Christianity",
    "Economics",
    "Health & Fitness",
    "History",
    "Learning & Creativity",
    "Management & Leadership",
    "Money & Investments",
    "Personal Development",
    "Philosophy",
    "Politics & Society",
    "Productivity",
    "Psychology",
    "Relationships & Communication",
    "Science & Environment",
    "Technology & the Future",
] as const;

type ContentCategory = typeof CANONICAL_CONTENT_CATEGORIES[number];

export function isContentCategory(value: string): value is ContentCategory {
    return CANONICAL_CONTENT_CATEGORIES.some((category) => category === value);
}

export const CURATED_SEARCH_TOPICS: readonly ContentCategory[] = [
    "Business",
    "Money & Investments",
    "Personal Development",
    "Productivity",
    "Health & Fitness",
    "Psychology",
];

export const CURATED_LANDING_CATEGORY_ORDER: readonly ContentCategory[] = [
    "Personal Development",
    "Health & Fitness",
    "Money & Investments",
    "Productivity",
    "Philosophy",
    "Business",
    "Science & Environment",
    "Psychology",
    "Christianity",
    "Relationships & Communication",
    "Technology & the Future",
    "Politics & Society",
];

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

export function getContentCategoryRawValues(category?: string | null) {
    const canonicalCategory = getCanonicalContentCategory(category);
    if (!canonicalCategory) return [];

    return Array.from(new Set([
        canonicalCategory,
        ...Object.entries(CONTENT_CATEGORY_ALIASES)
            .filter(([, canonical]) => canonical === canonicalCategory)
            .map(([alias]) => alias),
    ]));
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
