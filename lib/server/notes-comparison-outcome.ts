import "server-only";
import type { RankedPersonalEvidence } from "@/lib/server/personal-evidence-ranking";

function activityWords(text: string): string[] {
    return (text.normalize("NFKC").toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? [])
        .map(word => word.replace(/(ch|sh|x|z|ss)es$|([^s])s$/u, "$1$2"));
}

/** Narrow to explicit outcome comparisons, e.g. whether tagging made searches faster.
 * Other forms still use the normal semantic selector without a lexical prerequisite. */
export function notesComparisonActivity(question: string): string[] {
    const match = /\bwhether\b[^.!?\r\n]{1,220}?\b(?:made|makes?|would make)\s+(?:(?:my|our|their|your|his|her|the)\s+)?([\p{L}\p{N}]+(?:[ \t-]+[\p{L}\p{N}]+){0,3})\s+(?:faster|quicker|slower|easier|harder)\b/iu.exec(question);
    if (!match || /^(?:it|this|that|them|these|those|me|us|you|him|her)$/iu.test(match[1])) return [];
    return activityWords(match[1]);
}

/** A topic match or generic time saving is not evidence about a named activity.
 * Titles and reflection prompts do not count. Luna still judges the actual relationship. */
export function hasNotesComparisonActivity(item: RankedPersonalEvidence, activity: readonly string[]) {
    return item.spans.some(({ field, text }) => {
        if (field === "prompt") return false;
        const words = new Set(activityWords(text));
        return activity.every(word => {
            const stem = word.replace(/e$/u, "");
            return words.has(word) || words.has(stem + "ing") || words.has(stem + "ed");
        });
    });
}
