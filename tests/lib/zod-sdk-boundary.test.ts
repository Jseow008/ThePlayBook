import { afterEach, describe, expect, it, vi } from "vitest";
import { zodSchema } from "ai";
import { buildPersonalEvidenceSelectionRequest, generatePersonalEvidenceSelection,
    PERSONAL_EVIDENCE_SELECTOR_LUNA_MODEL_CONFIG, PersonalEvidenceSelectionError, selectPersonalEvidence } from "@/lib/server/personal-evidence-selector";
import beforeSchema from "@/tests/fixtures/validation/zod3-selector-schema.json";
import beforeProviderSchemas from "@/tests/fixtures/validation/zod3-provider-schemas.json";

const mocks = vi.hoisted(() => ({ record: vi.fn() }));
vi.mock("@/lib/server/ai-spending", () => ({ AiSpendingError: class extends Error {},
    reserveAiProviderCall: vi.fn(async () => ({ record: mocks.record })) }));
const candidates = ["A", "B"].map(id => ({ id, type: "highlight" as const, title: "Synthetic source",
    fields: [{ name: "highlightedText" as const, text: "Original saved quotation" }] }));
const request = () => buildPersonalEvidenceSelectionRequest({ question: "Find the synthetic action", candidates }).request;
const valid = () => ({ requestedFacets: ["Synthetic action"], assessments: [{ id: "A", requestedFacet: "Synthetic action",
    supportSummary: "The saved passage establishes the action", constraintCheck: "Exact synthetic context", verdict: "direct" }] });
const privateText = "PRIVATE synthetic output that must not survive an exception";

afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); vi.clearAllMocks(); });
function providerTransport(provider: string, text: string) {
    vi.stubEnv("ANTHROPIC_API_KEY", "synthetic-test-key"); vi.stubEnv("OPENAI_API_KEY", "synthetic-test-key");
    vi.stubEnv("AI_PROVIDER", provider === "anthropic" ? "anthropic" : "openai");
    vi.stubEnv("PERSONAL_EVIDENCE_SELECTOR_MODEL", provider === "luna" ? PERSONAL_EVIDENCE_SELECTOR_LUNA_MODEL_CONFIG.model : "");
    const bodies: Array<Record<string, unknown>> = [];
    const transport = vi.fn<typeof fetch>(async (url, options) => {
        // No network fallback: every provider operation must hit this controlled response.
        expect(String(url)).toMatch(/^https:\/\/api\.(anthropic\.com|openai\.com)\/v1\/(messages|responses)$/);
        bodies.push(JSON.parse(String(options?.body)) as Record<string, unknown>);
        const body = provider === "anthropic" ? {
            id: "msg_fixture", type: "message", role: "assistant", model: "claude-haiku-4-5-20251001",
            content: [{ type: "text", text }], stop_reason: "end_turn", stop_sequence: null,
            usage: { input_tokens: 10, output_tokens: 20 },
        } : {
            id: "resp_fixture", object: "response", created_at: 1, model: "synthetic", status: "completed",
            error: null, incomplete_details: null, output: [{ type: "message", id: "m1", role: "assistant", status: "completed",
                ...(provider === "luna" ? { phase: "final_answer" } : {}),
                content: [{ type: "output_text", text, annotations: [], logprobs: [] }] }],
            usage: { input_tokens: 10, output_tokens: 20, total_tokens: 30 },
        };
        return new Response(JSON.stringify(body), { headers: { "content-type": "application/json" } });
    });
    vi.stubGlobal("fetch", transport);
    return { transport, bodies };
}

describe("Zod 4 through the real AI SDK schema and provider boundary", () => {
    it("preserves the Zod 3 selector wire contract and quote-mode limits", () => {
        expect(zodSchema(request().schema).jsonSchema).toEqual(beforeSchema);
        const quote = buildPersonalEvidenceSelectionRequest({ question: "Quote it", candidates, exactQuote: true }).request;
        expect(zodSchema(quote.schema).jsonSchema).toMatchObject({ properties: { assessments: { maxItems: 1 } } });
    });
    for (const provider of ["openai", "anthropic", "luna"]) {
        it(`${provider}: validates actual structured output and sends the complete schema`, async () => {
            const { transport, bodies } = providerTransport(provider, JSON.stringify(valid()));
            const result = await selectPersonalEvidence({ question: "Find the synthetic action", candidates, generate: generatePersonalEvidenceSelection });
            expect(result.ids).toEqual(["A"]);
            expect(transport).toHaveBeenCalledTimes(1); expect(mocks.record).toHaveBeenCalledTimes(1);
            const body = bodies[0] as { text?: { format?: { schema?: unknown } }; output_config?: { format?: { schema?: unknown } }; tools?: Array<{ input_schema?: unknown }> };
            const schema = body.text?.format?.schema ?? body.output_config?.format?.schema ?? body.tools?.[0]?.input_schema;
            // Anthropic already strips unsupported keywords under Zod 3. Compare
            // actual provider wire contracts, not the pre-sanitization schema.
            expect(schema).toEqual(beforeProviderSchemas[provider as keyof typeof beforeProviderSchemas]);
        });
        const failures = [
            { name: "truncated JSON", output: `{"requestedFacets":["${privateText}"` },
            { name: "wrong shape", output: JSON.stringify({ requestedFacets: privateText, assessments: [] }) },
            { name: "unknown ID", output: JSON.stringify({ ...valid(), assessments: [{ ...valid().assessments[0], id: privateText }] }) },
            { name: "duplicate IDs", output: JSON.stringify({ ...valid(), assessments: [valid().assessments[0], valid().assessments[0]] }) },
            { name: "unknown property", output: JSON.stringify({ ...valid(), extra: privateText }) },
            { name: "blank required text", output: JSON.stringify({ ...valid(), requestedFacets: [" "] }) },
            { name: "oversized assessments", output: JSON.stringify({ ...valid(), assessments: Array(9).fill(valid().assessments[0]) }) },
        ];
        for (const failure of failures) it(`${provider}: fails closed for ${failure.name}`, async () => {
            const { transport } = providerTransport(provider, failure.output);
            let rejected: unknown;
            try { await selectPersonalEvidence({ question: "Find the synthetic action", candidates, generate: generatePersonalEvidenceSelection }); }
            catch (error) { rejected = error; }
            expect(rejected).toBeInstanceOf(PersonalEvidenceSelectionError);
            expect((rejected as Error).cause).toBeUndefined();
            expect(JSON.stringify(rejected) + String(rejected)).not.toContain(privateText);
            expect(transport).toHaveBeenCalledTimes(1);
        });
    }
});
