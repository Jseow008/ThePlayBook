import { beforeEach, describe, expect, it, vi } from "vitest";
import { generateText } from "ai";
import { reserveAiProviderCall } from "@/lib/server/ai-spending";
import { generateEvidenceComparison, isEvidenceComparison, prependEvidenceComparison } from "@/lib/server/evidence-comparison";
import { LIBRARY_FOLLOWUP_INSTRUCTIONS } from "@/lib/server/library-followup-output";

vi.mock("ai", async (importOriginal) => ({
    ...await importOriginal<typeof import("ai")>(),
    generateText: vi.fn(),
    wrapLanguageModel: vi.fn(({ model }) => model),
}));
vi.mock("@ai-sdk/openai", () => ({
    createOpenAI: () => (modelId: string) => ({ modelId }),
}));
vi.mock("@/lib/server/ai-spending", () => ({ reserveAiProviderCall: vi.fn() }));

const comparison = {
    system: "Existing answer prompt",
    question: "Compare the two passages.",
    maxOutputTokens: 450,
    signal: new AbortController().signal,
};
const record = vi.fn(async () => {});
beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(reserveAiProviderCall).mockResolvedValue({ record });
});

describe("direct comparisons preserve the original evidence contract", () => {
    it("recognizes explicit comparisons without broad summary or search terms", () => {
        for (const question of ["Contrast my notes", "A versus B", "What is the difference between them?"]) {
            expect(isEvidenceComparison(question)).toBe(true);
        }
        for (const question of ["Summarize these notes", "Find my note", "Why did she change the approach?"]) {
            expect(isEvidenceComparison(question)).toBe(false);
        }
    });

    it("preserves excerpt text and offsets after a Unicode comparison and escapes generated links", () => {
        const extracts = { text: "header\n\nExcerpt 🧭", ranges: [{ start: 8, end: 18 }] };
        const reply = prependEvidenceComparison(extracts, "💡 [fake citation](https://example.invalid)");
        expect(reply.text).toContain("\\[fake citation\\]");
        expect(reply.text.endsWith(extracts.text)).toBe(true);
        expect(reply.text.slice(reply.ranges[0].start, reply.ranges[0].end)).toBe("Excerpt 🧭");
        expect(prependEvidenceComparison(extracts, null)).toBe(extracts);
    });

    it("never sends Notes comparison work if its independent reservation is denied", async () => {
        vi.mocked(reserveAiProviderCall).mockRejectedValueOnce(new Error("Duplicate reservation"));
        await expect(generateEvidenceComparison({ ...comparison, surface: "notes" })).resolves.toBeNull();
        expect(reserveAiProviderCall).toHaveBeenCalledWith(expect.objectContaining({
            notesStage: "comparison", provider: "openai", model: "gpt-6-luna",
        }));
        expect(generateText).not.toHaveBeenCalled();
    });

    it("uses the unchanged surface prompt and falls back after provider failure", async () => {
        vi.mocked(generateText).mockRejectedValueOnce(new Error("provider unavailable"));
        await expect(generateEvidenceComparison({ ...comparison, surface: "notes" })).resolves.toBeNull();
        expect(generateText).toHaveBeenCalledWith(expect.objectContaining({
            system: comparison.system, maxRetries: 0,
            providerOptions: { openai: { reasoningEffort: "none", forceReasoning: true, store: false } },
        }));
        vi.mocked(generateText).mockRejectedValueOnce(new Error("provider unavailable"));
        await expect(generateEvidenceComparison({ ...comparison, surface: "library" })).resolves.toBeNull();
        expect(generateText).toHaveBeenLastCalledWith(expect.objectContaining({
            system: `${comparison.system}\n\nReturn JSON with answer as the FIRST field, then followUpQuestions. Complete the answer before writing any questions.\n${LIBRARY_FOLLOWUP_INSTRUCTIONS}`,
        }));
    });

    it("uses the remaining Library budget and keeps time for a final recheck", async () => {
        const clock = vi.spyOn(performance, "now").mockReturnValue(1_000);
        const timeout = vi.spyOn(AbortSignal, "timeout").mockReturnValue(new AbortController().signal);
        try {
            vi.mocked(generateText).mockRejectedValueOnce(new Error("test provider stopped"));
            await generateEvidenceComparison({ ...comparison, surface: "library", deadlineAt: 29_000 });
            expect(timeout).toHaveBeenCalledWith(22_000);
            vi.mocked(reserveAiProviderCall).mockClear();
            await expect(generateEvidenceComparison({ ...comparison, surface: "library", deadlineAt: 7_500 }))
                .resolves.toBeNull();
            expect(reserveAiProviderCall).not.toHaveBeenCalled();
        } finally {
            clock.mockRestore();
            timeout.mockRestore();
        }
    });

    it("does not publish the fallback when the request has been cancelled", async () => {
        const cancel = new AbortController();
        vi.mocked(generateText).mockImplementationOnce(async () => {
            cancel.abort();
            throw new Error("cancelled");
        });
        await expect(generateEvidenceComparison({ ...comparison, signal: cancel.signal, surface: "notes" }))
            .rejects.toMatchObject({ name: "AbortError" });
    });
});
