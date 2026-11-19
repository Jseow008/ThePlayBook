import "server-only";

import { createOpenAI } from "@ai-sdk/openai";
import { generateText, Output } from "ai";
import { reserveAiProviderCall } from "@/lib/server/ai-spending";
import { INTERACTIVE_AI_MODEL, INTERACTIVE_AI_PROVIDER_OPTIONS } from "@/lib/server/interactive-ai";
import { libraryAnswerSystemPrompt, LibraryAnswerOutputSchema, parseLibraryAnswer } from "@/lib/server/library-followup-output";
import { withLunaFinalPhase } from "@/lib/server/luna-final-phase";

export function isEvidenceComparison(question: string) {
    return /\b(compare|contrast|comparison|versus)\b|\b(?:differences?|similarities?) between\b|\b(?:differ|different) from\b/i.test(question);
}

/** Optional synthesis uses only the current authorized selection. A failed or
 * declined synthesis leaves the original extracts and follow-up actions available. */
export async function generateEvidenceComparison(options: {
    surface: "library" | "notes";
    system: string;
    question: string;
    maxOutputTokens: number;
    signal: AbortSignal;
}): Promise<string | null> {
    const { surface, system, question, maxOutputTokens, signal } = options;
    signal.throwIfAborted();
    const comparisonSignal = AbortSignal.any([signal, AbortSignal.timeout(15_000)]);
    try {
        const reservation = await reserveAiProviderCall({
            provider: "openai", model: INTERACTIVE_AI_MODEL, maxOutputTokens,
            notesStage: surface === "notes" ? "comparison" : undefined, signal: comparisonSignal,
        });
        comparisonSignal.throwIfAborted();
        const library = surface === "library";
        const result = await generateText({
            model: withLunaFinalPhase(createOpenAI({ apiKey: process.env.OPENAI_API_KEY })(INTERACTIVE_AI_MODEL)),
            providerOptions: INTERACTIVE_AI_PROVIDER_OPTIONS,
            system: library ? libraryAnswerSystemPrompt(system) : system,
            ...(library ? { output: Output.object({ schema: LibraryAnswerOutputSchema }) } : {}),
            messages: [{ role: "user", content: question }],
            maxRetries: 0,
            maxOutputTokens,
            abortSignal: comparisonSignal,
        });
        await reservation.record(result.usage);
        signal.throwIfAborted();
        const answer = (library ? parseLibraryAnswer(result.text, result.finishReason).answer : result.text).trim();
        return answer && answer.length <= 4_000 ? answer : null;
    } catch {
        signal.throwIfAborted();
        return null;
    }
}

/** Preserve the extract text, including literal quotations and export offsets. */
export function prependEvidenceComparison(
    extracts: { text: string; ranges: Array<{ start: number; end: number }> },
    comparison: string | null,
) {
    if (!comparison) return extracts;
    // Only real signed app links are attached to the reply. Escape model links,
    // HTML and backtick fences so they cannot replace or mimic the source links.
    const prefix = comparison.replace(/[\\\[\]<>`]/g, "\\$&") + "\n\n---\n\n";
    return {
        text: prefix + extracts.text,
        ranges: extracts.ranges.map(({ start, end }) => ({ start: start + prefix.length, end: end + prefix.length })),
    };
}
