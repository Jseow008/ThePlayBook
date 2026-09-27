import "server-only";

import { AsyncLocalStorage } from "node:async_hooks";
import { randomBytes } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { getAdminClient } from "@/lib/supabase/admin";
import { aiNetworkIdentifier } from "@/lib/server/ai-rate-limit";
import type { AiUsageFeature } from "@/lib/server/ai-usage-quota";

type Scope = { feature: AiUsageFeature; request: NextRequest; authenticated: boolean };
const scopes = new AsyncLocalStorage<Scope>();

/** Only interactive routes enter this scope; offline evaluation/indexing has separate budgets. */
export function withAiSpendingScope<T>(request: NextRequest, feature: AiUsageFeature, run: () => T): T {
    return scopes.run({ request, feature, authenticated: false }, run);
}
export function markAiSpendingAuthenticated(): void {
    const scope = scopes.getStore();
    if (scope) scope.authenticated = true;
}

type Reason = "disabled" | "global_budget" | "guest_budget" | "guest_quota" | "unavailable";
export class AiSpendingError extends Error {
    constructor(readonly reason: Reason, readonly retryAfterMs = 60_000) {
        super("AI spending admission unavailable");
        this.name = "AiSpendingError";
    }
}
export function aiSpendingFailureResponse(error: unknown): NextResponse | null {
    if (!(error instanceof AiSpendingError)) return null;
    const limited = ["global_budget", "guest_budget", "guest_quota"].includes(error.reason);
    return NextResponse.json({ error: {
        code: limited ? "AI_BUDGET_EXCEEDED" : "AI_TEMPORARILY_UNAVAILABLE",
        message: limited ? "The AI allowance is currently used up. Please try again after it resets."
            : "AI features are temporarily unavailable. Please try again later.",
    } }, { status: limited ? 429 : 503, headers: {
        "Retry-After": String(Math.max(1, Math.ceil(error.retryAfterMs / 1000))),
        "Cache-Control": "no-store",
    } });
}

// Reviewed list prices, 27 Sep 2026. Integer nano-USD/token. No prompt caching,
// tools, paid searches, priority tier, or automatic provider retries are enabled.
// Reserve the entire supported context, not an unreliable characters/token estimate.
const prices: Record<string, { input: number; cachedInput: number; output: number; context: number }> = {
    "anthropic:claude-haiku-4-5-20251001": { input: 1000, cachedInput: 100, output: 5000, context: 200_000 },
    "anthropic:claude-haiku-4-5": { input: 1000, cachedInput: 100, output: 5000, context: 200_000 },
    "anthropic:claude-sonnet-4-6": { input: 3000, cachedInput: 300, output: 15000, context: 1_000_000 },
    "openai:gpt-4o-mini": { input: 150, cachedInput: 75, output: 600, context: 128_000 },
    "openai:gpt-4o-mini-2024-07-18": { input: 150, cachedInput: 75, output: 600, context: 128_000 },
    "google:gemini-embedding-001": { input: 150, cachedInput: 150, output: 0, context: 2048 },
};
const admissionSchema = z.discriminatedUnion("allowed", [
    z.object({ allowed: z.literal(true), operationId: z.string().uuid(), reservedMicrousd: z.number().int().positive().safe() }),
    z.object({ allowed: z.literal(false), reason: z.enum(["disabled", "global_budget", "guest_budget", "guest_quota"]),
        retryAfterMs: z.number().int().nonnegative().safe() }),
]);

/** Time-bound IDs prevent replay after the ledger's bounded retention period. */
export function newAiSpendOperationId(): string {
    const bytes = randomBytes(16);
    bytes.writeUIntBE(Date.now(), 0, 6);
    bytes[6] = (bytes[6] & 0x0f) | 0x70;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;
    const hex = bytes.toString("hex");
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
function tokenCount(value: unknown): value is number {
    return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}
type Usage = { inputTokens?: number; outputTokens?: number; inputTokenDetails?: { cacheWriteTokens?: number; cacheReadTokens?: number } };
type Reservation = { record: (usage: Usage) => Promise<void> };
const unscopedReservation: Reservation = { record: async () => {} };

export async function reserveAiProviderCall(options: {
    provider: string; model: string; maxOutputTokens: number; inputs?: number; signal?: AbortSignal;
}): Promise<Reservation> {
    const scope = scopes.getStore();
    if (!scope) return unscopedReservation;
    const price = prices[`${options.provider}:${options.model}`];
    const inputs = options.inputs ?? 1;
    if (!price || !Number.isSafeInteger(inputs) || inputs < 1 || inputs > 1000
        || !tokenCount(options.maxOutputTokens) || options.maxOutputTokens > 1600
        || (options.provider !== "google" && inputs !== 1)
        || (options.provider === "google" && options.maxOutputTokens !== 0)) {
        throw new AiSpendingError("unavailable");
    }
    const signal = AbortSignal.any([scope.request.signal, ...(options.signal ? [options.signal] : []), AbortSignal.timeout(10_000)]);
    signal.throwIfAborted();
    const guestKey = scope.authenticated ? null : aiNetworkIdentifier(scope.request);
    if (!scope.authenticated && (scope.feature !== "author-chat" || !guestKey)) throw new AiSpendingError("unavailable");
    const reserved = Math.ceil((price.context * inputs * price.input + options.maxOutputTokens * price.output) / 1000);
    const operationId = newAiSpendOperationId();
    try {
        const { data, error } = await getAdminClient().rpc("reserve_ai_spend", {
            p_operation_id: operationId, p_feature: scope.feature, p_provider: options.provider,
            p_model: options.model, p_reserved_microusd: reserved, p_guest_key: guestKey ?? undefined,
        }).abortSignal(signal);
        if (error) throw new AiSpendingError("unavailable");
        const admission = admissionSchema.parse(data);
        if (!admission.allowed) throw new AiSpendingError(admission.reason, admission.retryAfterMs);
        if (admission.operationId !== operationId || admission.reservedMicrousd !== reserved) throw new AiSpendingError("unavailable");
        signal.throwIfAborted();
    } catch (error) {
        if (error instanceof AiSpendingError) throw error;
        // Never retry ambiguous admission: it may already have consumed budget.
        throw new AiSpendingError("unavailable");
    }
    return { record: async (usage) => {
        // Missing usage, failed calls and cancelled streams retain the full reservation.
        if (!tokenCount(usage.inputTokens) || !tokenCount(usage.outputTokens)) return;
        // Cache writes have a different tariff; these routes do not request them.
        // If a provider unexpectedly reports them, keep the conservative reserve.
        const cacheWrites = usage.inputTokenDetails?.cacheWriteTokens;
        if (cacheWrites !== undefined && cacheWrites !== 0) return;
        const cached = usage.inputTokenDetails?.cacheReadTokens ?? 0;
        if (!tokenCount(cached) || cached > usage.inputTokens) return;
        const cost = Math.ceil(((usage.inputTokens - cached) * price.input + cached * price.cachedInput + usage.outputTokens * price.output) / 1000);
        if (!Number.isSafeInteger(cost)) return;
        try {
            const { data, error } = await getAdminClient().rpc("record_ai_spend", {
                p_operation_id: operationId, p_input_tokens: usage.inputTokens,
                p_output_tokens: usage.outputTokens, p_cost_microusd: cost,
            }).abortSignal(AbortSignal.timeout(10_000));
            if (error || !data || typeof data !== "object" || Array.isArray(data) || data.recorded !== true) {
                console.error("AI spending settlement incomplete; reservation retained or emergency switch activated");
            }
        } catch {
            // Independent deadline: a disconnected browser must not cancel accounting.
            console.error("AI spending settlement unavailable; reservation retained");
        }
    } };
}
