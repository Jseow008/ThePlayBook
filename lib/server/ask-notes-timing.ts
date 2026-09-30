import "server-only";
import { AsyncLocalStorage } from "node:async_hooks";

const phases = ["client", "auth", "rate_limit", "session", "quota", "embedding", "search", "load_evidence", "selection", "selection_reserve", "selection_provider", "selection_settle", "revalidate_evidence", "revalidate_search", "revalidate_auth"] as const;
type Phase = typeof phases[number];
type Timing = { ms: number; active: Map<symbol, number> };
const storage = new AsyncLocalStorage<Map<Phase, Timing>>();

/** No-op outside Ask Notes. Records elapsed waits, never payloads or errors. */
export async function measureAskNotesPhase<T>(phase: Phase, work: () => PromiseLike<T>): Promise<T> {
    const timings = storage.getStore();
    if (!timings || !phases.includes(phase)) return work();
    const value = timings.get(phase) ?? { ms: 0, active: new Map<symbol, number>() };
    timings.set(phase, value);
    const start = performance.now();
    const invocation = Symbol();
    value.active.set(invocation, start);
    try { return await work(); }
    finally {
        value.active.delete(invocation);
        value.ms += performance.now() - start;
    }
}

/** Response-ready time, not stream completion or browser-perceived latency. */
export async function withAskNotesTiming(work: () => Promise<Response>): Promise<Response> {
    const start = performance.now();
    return storage.run(new Map(), async () => {
        let status = 500;
        let response: Response | undefined;
        try {
            response = await work();
            status = response.status;
        } finally {
            const end = performance.now();
            const timings = storage.getStore()!;
            const measured = Object.fromEntries([...timings].map(([name, value]) => [name, {
                ms: Math.round(value.ms + [...value.active.values()].reduce((sum, at) => sum + end - at, 0)),
                incomplete: value.active.size > 0,
            }]));
            const total = Math.round(end - start);
            const region = /^[a-z]{3}\d$/.test(process.env.VERCEL_REGION ?? "") ? process.env.VERCEL_REGION : "unknown";
            // Fixed names, numeric durations and status only. Independent of paid analytics/log retrieval.
            try {
                console.info(JSON.stringify({ event: "ask_notes_timing", region, status, response_ready_ms: total, phases: measured }));
            } catch { /* Telemetry must never interrupt answer delivery. */ }
            if (response) {
                const headers = new Headers(response.headers);
                headers.set("Server-Timing", [...Object.entries(measured).map(([name, value]) => `${name};dur=${value.ms}${value.incomplete ? ';desc="incomplete"' : ''}`), `response_ready;dur=${total}`].join(", "));
                headers.set("Cache-Control", "no-store");
                response = new Response(response.body, { status: response.status, statusText: response.statusText, headers });
            }
        }
        return response!;
    });
}
