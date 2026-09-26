import "server-only";

export const MAX_LIBRARY_CONTEXT_CHARS = 6_000;
const MAX_OUTPUT_TOKENS = {
    library_metadata: 250,
    content_synthesis: 450,
    hybrid: 500,
    reading_advisor: 550,
} as const;
export const DEFAULT_ANTHROPIC_MODEL = "claude-haiku-4-5-20251001";
const DEFAULT_COMPLEX_ASK_MODEL = "claude-sonnet-4-6";
const RETIRED_ANTHROPIC_MODEL_REPLACEMENTS: Record<string, string> = {
    "claude-sonnet-4-20250514": DEFAULT_COMPLEX_ASK_MODEL,
};
export type AskIntent = "library_metadata" | "content_synthesis" | "hybrid" | "reading_advisor";

export function getOutputTokenCap(intent: AskIntent): number {
    return MAX_OUTPUT_TOKENS[intent];
}

function shouldUseComplexAskModel(intent: AskIntent) {
    return intent === "content_synthesis" || intent === "hybrid" || intent === "reading_advisor";
}

export function getAnthropicModelName(intent: AskIntent) {
    const configuredModel = shouldUseComplexAskModel(intent)
        ? process.env.AI_COMPLEX_MODEL || DEFAULT_COMPLEX_ASK_MODEL
        : process.env.AI_MODEL || DEFAULT_ANTHROPIC_MODEL;

    return RETIRED_ANTHROPIC_MODEL_REPLACEMENTS[configuredModel] || configuredModel;
}

export function detectAskIntent(query: string): AskIntent {
    const normalized = query.toLowerCase();
    if (/\b(highlights?|notes?|reflections?|i wrote|i reflected|i highlighted)\b/.test(normalized)) return "hybrid";
    const advisorPatterns = [
        /\brecommend\b/,
        /\brecommendation\b/,
        /\bsuggest\b/,
        /\bsuggestion\b/,
        /\bnext (?:book|read|item|source)\b/,
        /\bwhat should i read next\b/,
        /\bwhat (?:book|item|source) should i read\b/,
        /\bbased on my completed\b/,
        /\bbased on what i(?:'ve| have) (?:read|completed|finished)\b/,
        /\bwhat does my library say about me\b/,
        /\bmy interests\b/,
        /\bmy taste\b/,
        /\breading taste\b/,
        /\breader profile\b/,
        /\brecurring themes\b/,
    ];
    const metadataPatterns = [
        /\bwhat have i read\b/,
        /\bwhat have i saved\b/,
        /\bcompleted\b/,
        /\bfinish(?:ed)?\b/,
        /\bhow many\b/,
        /\bwhich authors?\b/,
        /\blist\b/,
        /\bwhat books?\b/,
        /\bmy library\b/,
        /\bmy saved books?\b/,
        /\bmy saved items?\b/,
        /\bsaved sources?\b/,
        /\bin progress\b/,
    ];
    const synthesisPatterns = [
        /\btheme\b/,
        /\bthemes\b/,
        /\bcompare\b/,
        /\bperspective\b/,
        /\bperspectives\b/,
        /\bsummar(?:ize|ise)\b/,
        /\boverlap\b/,
        /\bcontrast\b/,
        /\brelevant\b/,
        /\bwhy\b/,
        /\bidea\b/,
        /\bideas\b/,
        /\bdiscipline\b/,
        /\bhabit\b/,
        /\bmeaning\b/,
        /\bconcept\b/,
        /\bpatterns?\b/,
    ];

    const advisorHits = advisorPatterns.filter((pattern) => pattern.test(normalized)).length;
    if (advisorHits > 0) {
        return "reading_advisor";
    }

    const metadataHits = metadataPatterns.filter((pattern) => pattern.test(normalized)).length;
    const synthesisHits = synthesisPatterns.filter((pattern) => pattern.test(normalized)).length;

    if (metadataHits > 0 && synthesisHits === 0) {
        return "library_metadata";
    }

    if (synthesisHits > 0 && metadataHits === 0) {
        return "content_synthesis";
    }

    return "hybrid";
}

export function shouldBoostCompletedForIntent(intent: AskIntent, query: string) {
    return intent === "reading_advisor" && /\bcompleted|finished|read\b/i.test(query);
}

export function buildRetrievalFallbackText(retrievalStatus: "skipped" | "matched" | "no_match" | "not_initialized", intent: AskIntent) {
    if (retrievalStatus === "skipped" && intent === "reading_advisor") {
        return "Retrieved passages were not available for this recommendation request. Answer from library metadata and clearly say the recommendation is based on titles, authors, statuses, and categories.";
    }

    if (retrievalStatus === "not_initialized") {
        return "Retrieved passages are not initialized yet. Only library metadata is available for this request.";
    }

    if (retrievalStatus === "no_match") {
        return intent === "reading_advisor"
            ? "Matching saved passages were limited for this recommendation request. Still answer from library metadata and clearly say the recommendation is based mostly on titles, authors, statuses, and categories."
            : "Matching saved passages were limited for this topic. Answer from library metadata first and explicitly note that passage evidence is limited.";
    }

    return "Retrieved passages were not needed for this question.";
}

export function detectNotesSynthesisIntent(query: string): boolean {
    return /\b(compare|comparison|summar(?:ize|ise)|theme|themes|pattern|patterns|tension|contradiction|overlap|across|contrast|perspectives?|qualif(?:y|ies)|differ(?:s|ence|ences)?|disagree(?:ment)?)\b/i.test(query);
}

/** Comparisons need the same attribution-capable model as Ask My Library. */
export function getNotesAnthropicModelName(query: string): string {
    return getAnthropicModelName(detectNotesSynthesisIntent(query) ? "content_synthesis" : "library_metadata");
}

export function getNotesOutputTokenCap(query: string) {
    return detectNotesSynthesisIntent(query) ? 450 : 350;
}
export const NOTES_NO_EVIDENCE = "I couldn’t find enough relevant evidence in your current notes scope to answer that. Try a more specific question or adjust the filters.";
export const LIBRARY_NO_EVIDENCE = "I couldn’t find enough relevant evidence in your saved sources, highlights, notes, or reflections to answer that. Try a more specific question.";
