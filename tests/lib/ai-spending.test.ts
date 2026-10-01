import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
const { rpc } = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock("@/lib/supabase/admin", () => ({ getAdminClient: () => ({ rpc }) }));
vi.mock("@/lib/server/ai-rate-limit", () => ({ aiNetworkIdentifier: (req: NextRequest) => req.headers.get("x-test-trusted-key") }));
import { AiSpendingError, aiSpendingFailureResponse, markAiSpendingAuthenticated, newAiSpendOperationId, reserveAiProviderCall, withAiSpendingScope } from "@/lib/server/ai-spending";

const options = { provider: "anthropic", model: "claude-haiku-4-5-20251001", maxOutputTokens: 400 };
const request = () => new NextRequest("https://example.com/api/chat");
function authenticated<T>(run: () => T, req = request()) {
    return withAiSpendingScope(req, "ask-library", () => { markAiSpendingAuthenticated(); return run(); });
}
function allow(name: string, args: Record<string, unknown>) {
    return { abortSignal: async () => ({ data: name === "reserve_ai_spend"
        ? { allowed: true, operationId: args.p_operation_id, reservedMicrousd: args.p_reserved_microusd }
        : { recorded: true }, error: null }) };
}
beforeEach(() => { vi.restoreAllMocks(); rpc.mockReset().mockImplementation(allow); });

describe("interactive spending admission", () => {
    it("reserves before dispatch and settles reported usage at reviewed integer prices", async () => {
        await authenticated(async () => {
            const reservation = await reserveAiProviderCall(options);
            expect(rpc).toHaveBeenCalledTimes(1);
            expect(rpc.mock.calls[0][1]).toMatchObject({ p_feature: "ask-library", p_reserved_microusd: 202000, p_guest_key: undefined });
            await reservation.record({ inputTokens: 100, outputTokens: 20 });
            expect(rpc.mock.calls[1]).toEqual(["record_ai_spend", expect.objectContaining({ p_cost_microusd: 200, p_input_tokens: 100, p_output_tokens: 20 })]);
        });
    });
    it.each([
        { inputTokens: 272000, cached: 1000, cost: 27160 },
        { inputTokens: 272001, cached: 1000, cost: 54296 },
    ])("settles Luna on the correct side of the long-context boundary", async ({ inputTokens, cached, cost }) => {
        await authenticated(async () => {
            const reservation = await reserveAiProviderCall({ provider: "openai", model: "gpt-6-luna", maxOutputTokens: 1600 });
            expect(rpc.mock.calls[0][1].p_reserved_microusd).toBe(211200);
            await reservation.record({ inputTokens, outputTokens: 100, inputTokenDetails: { cacheReadTokens: cached } });
            expect(rpc.mock.calls[1][1].p_cost_microusd).toBe(cost);
        });
    });
    it.each(["disabled", "global_budget", "guest_budget", "guest_quota"] as const)("rejects %s before dispatch with truthful response", async reason => {
        rpc.mockReturnValue({ abortSignal: async () => ({ data: { allowed: false, reason, retryAfterMs: 1234 }, error: null }) });
        const provider = vi.fn();
        try { await authenticated(async () => { await reserveAiProviderCall(options); provider(); }); }
        catch (error) {
            expect(error).toBeInstanceOf(AiSpendingError);
            const response = aiSpendingFailureResponse(error)!;
            expect(response.status).toBe(reason === "disabled" ? 503 : 429);
            expect(response.headers.get("Retry-After")).toBe("2");
            expect((await response.json()).error.code).not.toBe("NO_RESULTS");
        }
        expect(provider).not.toHaveBeenCalled();
        expect(rpc).toHaveBeenCalledTimes(1);
    });
    it.each([{ error: { message: "timeout" }, data: null }, { error: null, data: { allowed: true } }])("fails closed without retry for ambiguous/invalid RPC responses", async result => {
        rpc.mockReturnValue({ abortSignal: async () => result });
        await expect(authenticated(() => reserveAiProviderCall(options))).rejects.toMatchObject({ reason: "unavailable" });
        expect(rpc).toHaveBeenCalledTimes(1);
    });
    it("keeps missing/invalid usage reserved and uses an independent settlement deadline after disconnect", async () => {
        const controller = new AbortController();
        await authenticated(async () => {
            const reservation = await reserveAiProviderCall(options);
            for (const usage of [{}, { inputTokens: -1, outputTokens: 1 }, { inputTokens: 1.5, outputTokens: 1 }]) await reservation.record(usage);
            expect(rpc).toHaveBeenCalledTimes(1);
            controller.abort();
            rpc.mockImplementation(() => ({ abortSignal: async (signal: AbortSignal) => {
                expect(signal.aborted).toBe(false); return { data: { recorded: true }, error: null };
            } }));
            await reservation.record({ inputTokens: 1, outputTokens: 2 });
            expect(rpc).toHaveBeenCalledTimes(2);
        }, new NextRequest("https://example.com/api/chat", { signal: controller.signal }));
    });
    it("retains reservations when settlement fails without logging personal data", async () => {
        const log = vi.spyOn(console, "error").mockImplementation(() => {});
        await authenticated(async () => {
            const reservation = await reserveAiProviderCall(options);
            rpc.mockReturnValue({ abortSignal: async () => { throw Error("sensitive provider data"); } });
            await reservation.record({ inputTokens: 1, outputTokens: 2 });
        });
        expect(log).toHaveBeenCalledWith("AI spending settlement unavailable; reservation retained");
    });
    it("uses reported cache-read tariffs and keeps invalid or cache-write usage reserved", async () => {
        await authenticated(async () => {
            const reservation = await reserveAiProviderCall({ provider: "openai", model: "gpt-4o-mini", maxOutputTokens: 400 });
            await reservation.record({ inputTokens: 1000, outputTokens: 100, inputTokenDetails: { cacheReadTokens: 2000 } });
            await reservation.record({ inputTokens: 1000, outputTokens: 100, inputTokenDetails: { cacheWriteTokens: 1 } });
            expect(rpc).toHaveBeenCalledTimes(1);
            await reservation.record({ inputTokens: 1000, outputTokens: 100, inputTokenDetails: { cacheReadTokens: 800 } });
            expect(rpc.mock.calls[1][1].p_cost_microusd).toBe(150);
        });
    });
    it("separates guest and authenticated scopes even while requests overlap", async () => {
        const guest = new NextRequest("https://example.com/api/chat/author", { headers: { "x-test-trusted-key": "a".repeat(64) } });
        await Promise.all([
            withAiSpendingScope(guest, "author-chat", () => reserveAiProviderCall(options)),
            authenticated(async () => { await Promise.resolve(); return reserveAiProviderCall(options); }),
        ]);
        expect(rpc.mock.calls.map(call => call[1].p_guest_key)).toEqual(["a".repeat(64), undefined]);
    });
    it("requires a trusted guest key and does not permit unauthenticated library admission", async () => {
        await expect(withAiSpendingScope(request(), "author-chat", () => reserveAiProviderCall(options))).rejects.toBeInstanceOf(AiSpendingError);
        await expect(withAiSpendingScope(request(), "ask-library", () => reserveAiProviderCall(options))).rejects.toBeInstanceOf(AiSpendingError);
        expect(rpc).not.toHaveBeenCalled();
    });
    it("rejects unreviewed model pricing and invalid limits before spending", async () => {
        for (const changes of [{ model: "new-unpriced-model" }, { maxOutputTokens: 2000 }, { inputs: 2 }]) {
            await expect(authenticated(() => reserveAiProviderCall({ ...options, ...changes }))).rejects.toBeInstanceOf(AiSpendingError);
        }
        expect(rpc).not.toHaveBeenCalled();
    });
    it("reserves every embedding input at the full model token limit", async () => {
        await authenticated(() => reserveAiProviderCall({ provider: "google", model: "gemini-embedding-001", inputs: 32, maxOutputTokens: 0 }));
        expect(rpc.mock.calls[0][1].p_reserved_microusd).toBe(9831);
    });
    it("leaves explicit offline evaluation outside the interactive policy", async () => {
        const reservation = await reserveAiProviderCall(options);
        await reservation.record({ inputTokens: 100, outputTokens: 100 });
        expect(rpc).not.toHaveBeenCalled();
    });
    it("creates unique UUIDv7 values with the current timestamp", () => {
        const start = Date.now();
        const id = newAiSpendOperationId();
        expect(id).toMatch(/^[a-f0-9]{8}-[a-f0-9]{4}-7[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/);
        const timestamp = parseInt(id.replaceAll("-", "").slice(0, 12), 16);
        expect(timestamp).toBeGreaterThanOrEqual(start);
        expect(timestamp).toBeLessThanOrEqual(Date.now());
        expect(newAiSpendOperationId()).not.toBe(id);
    });
});
