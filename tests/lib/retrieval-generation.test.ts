import { afterEach, describe, expect, it, vi } from "vitest";
import { getNotesAnthropicModelName, getNotesOutputTokenCap } from "@/lib/server/retrieval-generation";

afterEach(() => vi.unstubAllEnvs());

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
