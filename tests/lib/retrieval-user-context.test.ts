import { describe, expect, it } from "vitest";
import { contextualizeUserQuestion } from "@/lib/server/retrieval-user-context";

const user = (content: string) => ({ role: "user" as const, content });
const assistant = (content: string) => ({ role: "assistant" as const, content });
const supporting = "Which specific notes best support your last answer? Cite them clearly.";

describe("bounded user context for fresh evidence retrieval", () => {
    it("carries the named user topic into a supporting-evidence follow-up without assistant text", () => {
        const result = contextualizeUserQuestion([user("What do my notes say about sleep deprivation?"), assistant("SECRET_UNAVAILABLE_FACT"), user(supporting)]);
        expect(result).toMatchObject({ currentQuestion: supporting, isContextual: true, contextMissing: false, requiresPassageEvidence: true });
        expect(result.semanticQuestion).toContain("sleep deprivation");
        expect(result.semanticQuestion).toContain(`Current request:\n${supporting}`);
        expect(result.semanticQuestion).not.toContain("SECRET_UNAVAILABLE_FACT");
    });
    it("retains the original topic through two follow-ups beyond the former four-message window", () => {
        const result = contextualizeUserQuestion([user("Explain my reflections about public speaking anxiety."), assistant("first answer"),
            user(supporting), assistant("second answer"), user("Show me a contrasting perspective from another saved source, if one exists.")]);
        expect(result.contextMissing).toBe(false);
        expect(result.semanticQuestion).toContain("public speaking anxiety");
        expect(result.semanticQuestion).toContain(supporting);
        expect(result.semanticQuestion).not.toContain("first answer");
    });
    it.each(["Compare sleep deprivation and exercise.", "Show another perspective on leadership.", "  Quote my reflection about attention exactly.  "])
        ("leaves a fresh self-contained question unchanged: %s", (question) => {
            const result = contextualizeUserQuestion([user("Explain memories about debt."), assistant("SECRET_OLD_ANSWER"), user(question)]);
            expect(result).toMatchObject({ semanticQuestion: question, currentQuestion: question, isContextual: false, contextMissing: false });
            expect(result.semanticQuestion).not.toContain("debt");
        });
    it("keeps an earlier quote request in topic context without changing the current action", () => {
        const result = contextualizeUserQuestion([user("Quote my reflection about attention exactly."), assistant("stored quote"), user("Summarize that idea.")]);
        expect(result).toMatchObject({ currentQuestion: "Summarize that idea.", contextMissing: false });
        expect(result.semanticQuestion).toContain("Quote my reflection about attention exactly.");
    });
    it.each(["What patterns show up across these notes?", "What themes show up across my saved items?", "What tensions or contradictions appear here?"])
        ("asks for the missing theme instead of reading it from an assistant answer: %s", (question) => {
            const result = contextualizeUserQuestion([user(question), assistant("The main theme is SECRET_ASSISTANT_TOPIC."), user(supporting)]);
            expect(result.contextMissing).toBe(true);
            expect(result.semanticQuestion).not.toContain("SECRET_ASSISTANT_TOPIC");
        });
    it("asks for clarification without a prior topic or when a newer broad question supersedes it", () => {
        expect(contextualizeUserQuestion([user(supporting)]).contextMissing).toBe(true);
        expect(contextualizeUserQuestion([user("Explain attention."), assistant("old"), user("What themes show up across my saved items?"), assistant("new"), user(supporting)]).contextMissing).toBe(true);
    });
    it("never clips a long prior question or exceeds the 2000-character combined limit", () => {
        const result = contextualizeUserQuestion([user("attention ".repeat(190)), assistant("answer"), user(supporting)]);
        expect(result.contextMissing).toBe(true);
        expect(result.semanticQuestion.length).toBeLessThanOrEqual(2_000);
    });
    it("bounds inherited turns and asks again instead of reaching through an unlimited follow-up chain", () => {
        const result = contextualizeUserQuestion([user("Explain attention."), user("Tell me more."), user("Expand on that."), user("How so?"), user(supporting)]);
        expect(result.contextMissing).toBe(true);
    });
});
