import "server-only";
import { selectPersonalEvidence, type PersonalEvidenceSelectionGenerator } from "./personal-evidence-selector";

export const AUTHOR_UNSUPPORTED_CAUSE = "The source does not state a reason for that, so I cannot establish why.";
export const AUTHOR_UNSUPPORTED_QUESTION = "I can explore the arguments and applications of this source, but the supplied text does not establish an answer to that question.";

/** Reuse the existing selector and its unchanged relationship/authority rules. */
export async function checkAuthorEvidence(options: {
    contentId: string; title: string; contextText: string; question: string; currentQuestion?: string;
    signal: AbortSignal; generate?: PersonalEvidenceSelectionGenerator;
}): Promise<string | null> {
    const result = await selectPersonalEvidence({
        questionCharacters: 20_000,
        question: options.question,
        candidates: [{ id: `source_segment:${options.contentId}`, type: "source_segment", title: options.title,
            fields: [{ name: "sourceText", text: options.contextText }] }],
        signal: options.signal, generate: options.generate,
    });
    if (result.ids.length) return null;
    return /\b(why|reasons?|motives?|motivations?|causes?|caused|because)\b/i.test(options.currentQuestion ?? options.question)
        ? AUTHOR_UNSUPPORTED_CAUSE : AUTHOR_UNSUPPORTED_QUESTION;
}
