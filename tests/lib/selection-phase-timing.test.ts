import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { generatePersonalEvidenceSelection } from "@/lib/server/personal-evidence-selector";
import { measureAskNotesPhase, withAskNotesTiming } from "@/lib/server/ask-notes-timing";

const mocks = vi.hoisted(() => ({ reserve: vi.fn(), generate: vi.fn(), record: vi.fn() }));
vi.mock("@/lib/server/ai-spending", () => ({ reserveAiProviderCall: mocks.reserve, AiSpendingError: class extends Error {} }));
vi.mock("ai", () => ({ generateText: mocks.generate, Output: { object: vi.fn() } }));
vi.mock("@ai-sdk/anthropic", () => ({ createAnthropic: () => () => ({}) }));
vi.mock("@ai-sdk/openai", () => ({ createOpenAI: () => () => ({}) }));
let now = 0;
const request = () => ({ system: "private system", prompt: "private question", schema: z.object({ requestedFacets: z.array(z.string()), assessments: z.array(z.object({ id: z.string(), requestedFacet: z.string(), supportSummary: z.string(), constraintCheck: z.string(), verdict: z.literal("direct") })) }), signal: new AbortController().signal, maxOutputTokens: 1600 });
beforeEach(() => {
    vi.resetAllMocks(); now = 0;
    vi.stubEnv("ANTHROPIC_API_KEY", "test-only"); vi.stubEnv("AI_PROVIDER", "anthropic");
    vi.spyOn(performance, "now").mockImplementation(() => now);
    vi.spyOn(console, "info").mockImplementation(() => {});
    mocks.reserve.mockImplementation(async () => { now += 20; return { record: mocks.record }; });
    mocks.generate.mockImplementation(async () => { now += 100; return { output: { requestedFacets: [], assessments: [] }, usage: { outputTokens: 12 }, response: { modelId: "test-model" } }; });
    mocks.record.mockImplementation(async () => { now += 30; });
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllEnvs(); });
describe("real selector generator timing boundaries", () => {
    it("separates reservation/provider/settlement inside the existing selection total", async () => {
        const response = await withAskNotesTiming(async () => {
            const result = await measureAskNotesPhase("selection", () => generatePersonalEvidenceSelection(request()));
            expect(result.model).toBe("test-model");
            return new Response("unchanged");
        });
        expect(response.headers.get("server-timing")).toBe("selection;dur=150, selection_reserve;dur=20, selection_provider;dur=100, selection_sdk_prepare;dur=100, selection_settle;dur=30, response_ready;dur=150");
        expect(await response.text()).toBe("unchanged");
        expect(mocks.record).toHaveBeenCalledWith({ outputTokens: 12 });
        expect(mocks.generate).toHaveBeenCalledWith(expect.objectContaining({ maxRetries: 0, maxOutputTokens: 1600, prompt: "private question" }));
        expect(JSON.stringify(vi.mocked(console.info).mock.calls)).not.toMatch(/private|test-model/);
    });
    it("does not call the provider when reservation fails", async () => {
        const failure = new Error("private failure");
        mocks.reserve.mockRejectedValue(failure);
        await expect(withAskNotesTiming(async () => { await generatePersonalEvidenceSelection(request()); return new Response(); })).rejects.toBe(failure);
        expect(mocks.generate).not.toHaveBeenCalled();
        expect(mocks.record).not.toHaveBeenCalled();
        const phases = JSON.parse(vi.mocked(console.info).mock.calls[0][0]).phases;
        expect(Object.keys(phases)).toEqual(["selection_reserve"]);
        expect(JSON.stringify(vi.mocked(console.info).mock.calls)).not.toContain("private failure");
    });
    it("preserves cancellation after reservation without starting provider work", async () => {
        const controller = new AbortController();
        const failure = new Error("cancelled");
        mocks.reserve.mockImplementation(async () => { controller.abort(failure); return { record: mocks.record }; });
        await expect(withAskNotesTiming(async () => { await generatePersonalEvidenceSelection({ ...request(), signal: controller.signal }); return new Response(); })).rejects.toBe(failure);
        expect(mocks.generate).not.toHaveBeenCalled();
        expect(mocks.record).not.toHaveBeenCalled();
    });
    it("preserves provider failure and skips settlement", async () => {
        const failure = new Error("provider failure");
        mocks.generate.mockRejectedValue(failure);
        await expect(withAskNotesTiming(async () => { await generatePersonalEvidenceSelection(request()); return new Response(); })).rejects.toBe(failure);
        expect(mocks.record).not.toHaveBeenCalled();
        expect(Object.keys(JSON.parse(vi.mocked(console.info).mock.calls[0][0]).phases)).toEqual(["selection_reserve", "selection_provider", "selection_sdk_prepare"]);
    });
});
