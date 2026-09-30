import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
const { rpc, generate, embed } = vi.hoisted(() => ({ rpc: vi.fn(), generate: vi.fn(), embed: vi.fn() }));
vi.mock("@/lib/supabase/admin", () => ({ getAdminClient: () => ({ rpc }) }));
vi.mock("@/lib/server/ai-rate-limit", () => ({ aiNetworkIdentifier: () => null }));
vi.mock("ai", async importOriginal => ({ ...await importOriginal<typeof import("ai")>(), generateText: generate }));
vi.mock("@google/genai", () => ({ GoogleGenAI: class { models = { embedContent: embed }; } }));
import { AiSpendingError, markAiSpendingAuthenticated, withAiSpendingScope } from "@/lib/server/ai-spending";
import { buildPersonalEvidenceSelectionRequest, generatePersonalEvidenceSelection } from "@/lib/server/personal-evidence-selector";
import { createGooglePersonalEvidenceEmbedder } from "@/lib/server/personal-evidence-ranking";
function scoped<T>(run: () => T) {
    return withAiSpendingScope(new NextRequest("https://example.com/api/chat/notes"), "ask-notes", () => { markAiSpendingAuthenticated(); return run(); });
}
const selection = () => generatePersonalEvidenceSelection({ ...buildPersonalEvidenceSelectionRequest({ question: "fixture", candidates: [] }).request, signal: new AbortController().signal });

beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("ANTHROPIC_API_KEY", "fixture");
    vi.stubEnv("AI_PROVIDER", "anthropic");
    vi.stubEnv("AI_MODEL", "claude-haiku-4-5-20251001");
    rpc.mockImplementation((name, args) => ({ abortSignal: async () => ({ data: name === "reserve_ai_spend"
        ? { allowed: true, operationId: args.p_operation_id, reservedMicrousd: args.p_reserved_microusd } : { recorded: true }, error: null }) }));
    generate.mockResolvedValue({ output: { requestedFacets: ["fixture"], assessments: [] }, usage: { inputTokens: 10, outputTokens: 5 }, response: { modelId: "claude-haiku-4-5-20251001" } });
    embed.mockResolvedValue({ embeddings: [{ values: [1, 0] }] });
});
afterEach(() => vi.unstubAllEnvs());

describe("nested provider spending boundaries", () => {
    it("admits selector generation before dispatch, with no automatic retries, then settles", async () => {
        await scoped(selection);
        expect(rpc.mock.invocationCallOrder[0]).toBeLessThan(generate.mock.invocationCallOrder[0]);
        expect(generate).toHaveBeenCalledWith(expect.objectContaining({ maxRetries: 0, maxOutputTokens: 1600 }));
        expect(rpc).toHaveBeenLastCalledWith("record_ai_spend", expect.objectContaining({ p_cost_microusd: 35 }));
    });
    it("blocks the selector and embedding provider when the policy is disabled", async () => {
        rpc.mockReturnValue({ abortSignal: async () => ({ data: { allowed: false, reason: "disabled", retryAfterMs: 1000 }, error: null }) });
        await expect(scoped(selection)).rejects.toBeInstanceOf(AiSpendingError);
        await expect(scoped(() => createGooglePersonalEvidenceEmbedder("fixture")(["text"], { signal: new AbortController().signal }))).rejects.toBeInstanceOf(AiSpendingError);
        expect(generate).not.toHaveBeenCalled();
        expect(embed).not.toHaveBeenCalled();
    });
    it("reserves every embedding batch and keeps its reservation when billed usage is unavailable", async () => {
        const embedder = createGooglePersonalEvidenceEmbedder("fixture");
        await scoped(async () => {
            await embedder(["one", "two"], { signal: new AbortController().signal });
            await embedder(["three"], { signal: new AbortController().signal });
        });
        expect(rpc).toHaveBeenCalledTimes(2);
        expect(rpc.mock.calls.map(call => call[1].p_reserved_microusd)).toEqual([615, 308]);
        expect(rpc.mock.invocationCallOrder[0]).toBeLessThan(embed.mock.invocationCallOrder[0]);
        expect(rpc.mock.invocationCallOrder[1]).toBeLessThan(embed.mock.invocationCallOrder[1]);
    });
    it("does not refund failed generation or dispatch again", async () => {
        generate.mockRejectedValueOnce(new Error("provider unavailable"));
        await expect(scoped(selection)).rejects.toThrow("provider unavailable");
        expect(generate).toHaveBeenCalledTimes(1);
        expect(rpc).toHaveBeenCalledTimes(1);
    });
});
