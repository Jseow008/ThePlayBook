import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { measureAskNotesPhase, withAskNotesTiming } from "@/lib/server/ask-notes-timing";

let now = 0;
beforeEach(() => {
    now = 0;
    vi.spyOn(performance, "now").mockImplementation(() => now);
    vi.spyOn(console, "info").mockImplementation(() => {});
    vi.stubEnv("VERCEL_REGION", "bom1");
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllEnvs(); });

describe("Ask Notes timing", () => {
    it("preserves body/protocol and reports fixed phase durations without data", async () => {
        const response = await withAskNotesTiming(async () => {
            await measureAskNotesPhase("auth", async () => { now += 12; return { id: "private-account" }; });
            await measureAskNotesPhase("selection", async () => { now += 25; return "private-question"; });
            return new Response("data: answer\n\n", { headers: { "x-vercel-ai-ui-message-stream": "v1" } });
        });
        expect(await response.text()).toBe("data: answer\n\n");
        expect(response.headers.get("x-vercel-ai-ui-message-stream")).toBe("v1");
        expect(response.headers.get("cache-control")).toBe("no-store");
        expect(response.headers.get("server-timing")).toBe("auth;dur=12, selection;dur=25, response_ready;dur=37");
        const log = JSON.parse(vi.mocked(console.info).mock.calls[0][0]);
        expect(log).toEqual({ event: "ask_notes_timing", region: "bom1", status: 200, response_ready_ms: 37,
            phases: { auth: { ms: 12, incomplete: false }, selection: { ms: 25, incomplete: false } } });
    });
    it("isolates overlapping requests", async () => {
        let release!: () => void;
        const first = withAskNotesTiming(async () => {
            await measureAskNotesPhase("auth", () => new Promise<void>(resolve => { release = resolve; }));
            return new Response();
        });
        const second = await withAskNotesTiming(async () => {
            await measureAskNotesPhase("search", async () => { now = 7; });
            return new Response();
        });
        release();
        expect(second.headers.get("server-timing")).not.toContain("auth");
        expect((await first).headers.get("server-timing")).not.toContain("search");
    });
    it("records incomplete work when a deadline response wins and does not log twice", async () => {
        let release!: () => void;
        let late!: Promise<void>;
        const response = await withAskNotesTiming(async () => {
            late = measureAskNotesPhase("embedding", () => new Promise<void>(resolve => { release = resolve; }));
            now = 50_000;
            return new Response(null, { status: 504 });
        });
        expect(response.headers.get("server-timing")).toContain('embedding;dur=50000;desc="incomplete"');
        release(); await late;
        expect(console.info).toHaveBeenCalledTimes(1);
    });
    it("preserves errors without recording their contents", async () => {
        const error = new Error("private query text");
        await expect(withAskNotesTiming(() => measureAskNotesPhase("selection", async () => { now = 9; throw error; }))).rejects.toBe(error);
        expect(JSON.stringify(vi.mocked(console.info).mock.calls)).not.toContain("private query text");
        expect(JSON.parse(vi.mocked(console.info).mock.calls[0][0]).phases.selection.ms).toBe(9);
    });
    it("does not instrument other routes and tolerates unavailable logging", async () => {
        expect(await measureAskNotesPhase("auth", async () => 42)).toBe(42);
        expect(console.info).not.toHaveBeenCalled();
        vi.mocked(console.info).mockImplementation(() => { throw new Error("logging unavailable"); });
        expect((await withAskNotesTiming(async () => new Response("ok"))).status).toBe(200);
    });
});
