import "server-only";

import { formatRankedPersonalEvidence, type RankedPersonalEvidence } from "@/lib/server/personal-evidence-ranking";

const words = (value: string) => new Set(value.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? []);

/** Keep explicit asides out of synthesis for single-outcome questions. The
 * stored spans used for extracts, citations and replay are never modified. */
export function focusNotesComparison(
    question: string,
    evidence: { contextText: string; items: readonly RankedPersonalEvidence[] },
): string {
    const focus = /\b(?:affect(?:ed|s)?|impact(?:ed|s)?|chang(?:e|ed|es))\s+(?:(?:my|our|the)\s+)?([\p{L}\p{N}]+(?:[ \t]+[\p{L}\p{N}]+){0,3})[ \t]*[?.!]?$/iu.exec(question)?.[1];
    if (!focus || /\b(?:and|or|it|this|that|them)\b/i.test(focus)) return evidence.contextText;
    const terms = [...words(focus)];
    const items = evidence.items.map(item => ({
        ...item,
        spans: item.spans.map(span => {
            if (span.field === "prompt") return span;
            // Only a trailing independent admission of an unrelated mistake.
            // Retain exceptions, qualifications, causal links and all other text.
            const aside = /,\s*but\s+(?:I|we)\b([^.!?\n]{1,180})[.!]?\s*$/iu.exec(span.text);
            const independent = aside && (
                /\b(?:incidentally|unrelatedly|as an aside)\b/i.test(aside[1])
                || (/\b(?:by mistake|by accident|accidentally)\b/i.test(aside[1])
                    && /\b(?:home|elsewhere|later that (?:day|evening)|the next day)\b/i.test(aside[1]))
            );
            if (!aside || !independent
                || /\b(?:because|since|so|only|unless|until|after|before|when|could|would|should|had to|needed to|did not|didn.t|not)\b/i.test(aside[1])) {
                return span;
            }
            const relevantText = span.text.slice(0, aside.index).trimEnd();
            const ending = relevantText.split(/[.!?\n]/u).at(-1) ?? "";
            const main = words(ending);
            const unrelated = words(aside[1]);
            if (!terms.every(term => main.has(term)) || terms.some(term => unrelated.has(term))) return span;
            return { ...span, text: relevantText, end: span.start + relevantText.length };
        }),
    }));
    return formatRankedPersonalEvidence(items).contextText;
}
