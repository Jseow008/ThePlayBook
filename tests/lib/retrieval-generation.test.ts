import { afterEach, describe, expect, it, vi } from "vitest";
import { detectAskIntent, getNotesAnthropicModelName, getNotesOutputTokenCap } from "@/lib/server/retrieval-generation";

afterEach(() => vi.unstubAllEnvs());

describe("Library evidence routing", () => {
    it.each([
        "What does my library say about Lee’s case for merger, and what did I write disagreeing with it?",
        "What did I write about patience in my library?",
        "What have I written about patience in my saved books?",
        "Find what I've recorded about patience in my library.",
        "What did I record about patience in my saved items?",
        "How many books have I saved, and what did I note about patience?",
        "List the saved sources and the reflection I wrote about patience.",
    ])("searches personal evidence for %s", (question) => {
        expect(detectAskIntent(question)).toBe("hybrid");
    });

    it.each([
        "What does my library say about patience?",
        "Which saved books discuss patience?",
        "List the books in my library and explain their views on patience.",
        "What do my saved sources teach about patience?",
        "Which saved books cover patience?",
    ])("does not mistake content requests for inventory: %s", (question) => {
        expect(detectAskIntent(question)).not.toBe("library_metadata");
    });

    it.each([
        "How many books have I saved?",
        "Which titles are saved in my library?",
        "List the titles and authors saved in my library.",
        "Which saved book is by Jane Austen?",
        "Who wrote Pride and Prejudice?",
        "What have I completed in my library?",
    ])("keeps inventory on its metadata path: %s", (question) => {
        expect(detectAskIntent(question)).toBe("library_metadata");
    });

    it("preserves recommendations and content-only searches", () => {
        expect(detectAskIntent("What should I read next?")).toBe("reading_advisor");
        expect(detectAskIntent("What does my library say about me?")).toBe("reading_advisor");
        expect(detectAskIntent("Explain the concept of patience.")).toBe("content_synthesis");
    });
});

describe("Notes generation model selection", () => {
    it("keeps simple recall on the standard model and comparisons on the synthesis model", () => {
        vi.stubEnv("AI_MODEL", "");
        vi.stubEnv("AI_COMPLEX_MODEL", "");
        expect(getNotesAnthropicModelName("What did I decide to do tomorrow?")).toBe("claude-haiku-4-5-20251001");
        for (const question of [
            "How does my written note qualify the focus advice, and what did I decide to do tomorrow?",
            "Where do my note and the passage differ?",
            "Compare my reflection with the highlighted advice.",
        ]) {
            expect(getNotesAnthropicModelName(question)).toBe("claude-sonnet-4-6");
            expect(getNotesOutputTokenCap(question)).toBe(450);
        }
    });

    it("honors separate configured models and maps the retired complex model", () => {
        vi.stubEnv("AI_MODEL", "configured-simple-model");
        vi.stubEnv("AI_COMPLEX_MODEL", "configured-complex-model");
        expect(getNotesAnthropicModelName("What did I save?")).toBe("configured-simple-model");
        expect(getNotesAnthropicModelName("Compare the interpretations.")).toBe("configured-complex-model");
        vi.stubEnv("AI_COMPLEX_MODEL", "claude-sonnet-4-20250514");
        expect(getNotesAnthropicModelName("Compare the interpretations.")).toBe("claude-sonnet-4-6");
    });
});

describe('inventory follow-up authority', () => {
    it.each(['Which of those two books is by Eckhart Tolle?', 'Which of these titles are written by Jane Austen?', 'Which of them is by Jane Austen?', 'Which of those sources is by Jane Austen?'])('routes %s to fresh metadata', question => {
        expect(detectAskIntent(question)).toBe('library_metadata');
    });
    it('still retrieves content for a mixed author and theme request', () => {
        expect(detectAskIntent('Which of those two books is by Jane Austen? Compare the themes.')).toBe('hybrid');
    });
});
