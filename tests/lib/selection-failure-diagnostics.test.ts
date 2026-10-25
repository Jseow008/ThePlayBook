import { describe, expect, it } from "vitest";
import { APICallError, JSONParseError, NoObjectGeneratedError, TypeValidationError } from "ai";
import { selectionFailureDiagnostics } from "@/lib/server/selection-failure-diagnostics";
import { PersonalEvidenceSelectionError, selectPersonalEvidence } from "@/lib/server/personal-evidence-selector";

const privateText = "PRIVATE prompt, note, model output and provider detail";
const apiError = (code = "rate_limit_exceeded", statusCode = 429) => new APICallError({
    message: privateText, url: `https://private.invalid/${privateText}`, requestBodyValues: { prompt: privateText },
    responseBody: privateText, responseHeaders: { "x-request-id": privateText }, statusCode,
    data: { error: { code, message: privateText } }, cause: new Error(privateText),
});
const invalidObject = () => new NoObjectGeneratedError({ text: privateText, message: privateText,
    cause: new JSONParseError({ text: privateText, cause: new Error(privateText) }),
    response: { id: privateText, modelId: privateText, timestamp: new Date() }, finishReason: "length",
    usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2,
        inputTokenDetails: { noCacheTokens: 1, cacheReadTokens: 0, cacheWriteTokens: 0 },
        outputTokenDetails: { textTokens: 1, reasoningTokens: 0 } },
});
const candidates = [{ id: "highlight:owned", type: "highlight" as const, title: "Synthetic source",
    fields: [{ name: "highlightedText" as const, text: privateText }] }];

describe("selection failure diagnostics", () => {
    it("retains only allowlisted API status, retryability, provider code and elapsed time", () => {
        expect(selectionFailureDiagnostics(apiError(), 12.6)).toEqual({
            category: "provider_api", duration_ms: 13, status_code: 429, retryable: true, provider_code: "rate_limit_exceeded",
        });
        const unsafe = selectionFailureDiagnostics(apiError(privateText, 900), 1);
        expect(unsafe).toEqual({ category: "provider_api", duration_ms: 1, retryable: true });
        expect(JSON.stringify(unsafe)).not.toContain(privateText);
    });
    it("distinguishes invalid structured output without retaining output, cause, metadata or validation issues", () => {
        expect(selectionFailureDiagnostics(invalidObject(), 4)).toEqual({ category: "invalid_response", duration_ms: 4, finish_reason: "length" });
        for (const error of [new JSONParseError({ text: privateText, cause: new Error(privateText) }),
            new TypeValidationError({ value: { note: privateText }, cause: new Error(privateText) })]) {
            expect(selectionFailureDiagnostics(error, 4)).toEqual({ category: "invalid_response", duration_ms: 4 });
        }
    });
    it("does not trust arbitrary exception names, messages or properties", () => {
        expect(selectionFailureDiagnostics({ name: "AI_APICallError", message: privateText, statusCode: 429 }, NaN))
            .toEqual({ category: "unknown", duration_ms: 0 });
        const error = apiError();
        Object.defineProperty(error, "data", { get() { throw new Error(privateText); } });
        expect(selectionFailureDiagnostics(error, 4)).toEqual({ category: "unknown", duration_ms: 4 });
    });
    it.each([apiError(), invalidObject(), new Error(privateText)])("drops the original failure at the selector boundary (%#)", async (original) => {
        let failure: unknown;
        try {
            await selectPersonalEvidence({ question: "Find the synthetic idea", candidates,
                generate: async () => { throw original; } });
        } catch (error) { failure = error; }
        expect(failure).toBeInstanceOf(PersonalEvidenceSelectionError);
        expect(failure).toMatchObject({ code: "UNAVAILABLE", diagnostics: { duration_ms: expect.any(Number) } });
        expect((failure as Error).cause).toBeUndefined();
        expect(JSON.stringify(failure) + String(failure) + (failure as Error).stack).not.toContain(privateText);
    });
    it("classifies rejected selector assessments without changing fail-closed behavior", async () => {
        await expect(selectPersonalEvidence({ question: "Find the synthetic idea", candidates,
            generate: async () => ({ output: { private: privateText } }) })).rejects.toMatchObject({
            code: "INVALID_SELECTION", diagnostics: { category: "invalid_selection", duration_ms: expect.any(Number) },
        });
    });
});
