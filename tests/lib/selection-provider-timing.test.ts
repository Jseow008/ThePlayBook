import { afterEach, describe, expect, it, vi } from "vitest";
import { createSelectionProviderTiming } from "@/lib/server/selection-provider-timing";
import { withAskNotesTiming } from "@/lib/server/ask-notes-timing";
import { createAnthropic } from "@ai-sdk/anthropic";
import { generateText, Output } from "ai";
import { z } from "zod";
const phases = (response: Response) => response.headers.get("server-timing")!;
afterEach(() => vi.restoreAllMocks());
describe("provider boundary timing", () => {
    it("measures preparation, headers, first observed bytes, body and SDK tail without changing bytes or request", async () => {
        let now = 0;
        vi.spyOn(performance, "now").mockImplementation(() => now);
        vi.spyOn(console, "info").mockImplementation(() => {});
        const controller = new AbortController();
        const request = new Request("https://fixture.invalid", { method: "POST", body: "private request", signal: controller.signal });
        let reads = 0;
        const transport = vi.fn<typeof fetch>(async () => {
            now += 20;
            return new Response(new ReadableStream({ pull(c) {
                if (reads++ === 0) { now += 30; c.enqueue(new TextEncoder().encode("private response")); }
                else { now += 40; c.close(); }
            } }, { highWaterMark: 0 }), { status: 201, statusText: "Created", headers: { "x-fixture": "retained" } });
        });
        const response = await withAskNotesTiming(async () => {
            const timing = createSelectionProviderTiming(transport);
            await timing.run(async () => {
                now += 10;
                const result = await timing.fetch(request);
                expect(result.status).toBe(201); expect(result.headers.get("x-fixture")).toBe("retained");
                expect(reads).toBe(0);
                expect(await result.text()).toBe("private response");
                now += 50;
            });
            return new Response("ok");
        });
        expect(transport).toHaveBeenCalledExactlyOnceWith(request, undefined);
        expect(phases(response)).toContain("selection_sdk_prepare;dur=10");
        expect(phases(response)).toContain("selection_headers;dur=20");
        expect(phases(response)).toContain("selection_first_byte;dur=50");
        expect(phases(response)).toContain("selection_body_read;dur=70");
        expect(phases(response)).toContain("selection_sdk_finish;dur=50");
        expect(JSON.stringify(vi.mocked(console.info).mock.calls)).not.toMatch(/private|fixture.invalid/);
    });
    it("passes the real SDK JSON response through without a provider request", async () => {
        vi.spyOn(console, "info").mockImplementation(() => {});
        const transport = vi.fn<typeof fetch>(async () => new Response(JSON.stringify({
            id: "fixture", type: "message", role: "assistant", model: "claude-haiku-4-5-20251001",
            content: [{ type: "text", text: '{"ids":["original-id"]}' }], stop_reason: "end_turn", stop_sequence: null,
            usage: { input_tokens: 10, output_tokens: 5 },
        }), { headers: { "content-type": "application/json" } }));
        const response = await withAskNotesTiming(async () => {
            const timing = createSelectionProviderTiming(transport);
            const result = await timing.run(() => generateText({ model: createAnthropic({ apiKey: "fixture", fetch: timing.fetch })("claude-haiku-4-5-20251001"), prompt: "fixture", maxRetries: 0, output: Output.object({ schema: z.object({ ids: z.array(z.string()) }) }) }));
            expect(result.output).toEqual({ ids: ["original-id"] });
            return new Response("ok");
        });
        expect(transport).toHaveBeenCalledTimes(1);
        expect(phases(response)).toContain("selection_sdk_finish");
        expect(phases(response)).not.toContain("incomplete");
    });
    it("preserves network rejection and marks the missing response boundary incomplete", async () => {
        vi.spyOn(console, "info").mockImplementation(() => {});
        const failure = new Error("private network failure");
        await expect(withAskNotesTiming(async () => {
            const timing = createSelectionProviderTiming(async () => { throw failure; });
            await timing.run(() => timing.fetch("https://fixture.invalid"));
            return new Response();
        })).rejects.toBe(failure);
        const record = JSON.parse(vi.mocked(console.info).mock.calls[0][0]);
        expect(record.phases.selection_first_byte.incomplete).toBe(true);
        expect(record.phases.selection_sdk_finish).toBeUndefined();
        expect(JSON.stringify(record)).not.toContain("private");
    });
    it("forwards cancellation to the source reader and preserves body errors", async () => {
        vi.spyOn(console, "info").mockImplementation(() => {});
        const cancel = vi.fn();
        const failure = new Error("cancelled");
        await withAskNotesTiming(async () => {
            const timing = createSelectionProviderTiming(async () => new Response(new ReadableStream({ cancel }, { highWaterMark: 0 })));
            await timing.run(async () => { const response = await timing.fetch("https://fixture.invalid"); await response.body!.cancel(failure); });
            return new Response();
        });
        expect(cancel).toHaveBeenCalledWith(failure);
        await withAskNotesTiming(async () => {
            const timing = createSelectionProviderTiming(async () => new Response(new ReadableStream({ pull(c) { c.error(failure); } }, { highWaterMark: 0 })));
            await timing.run(async () => { const response = await timing.fetch("https://fixture.invalid"); await expect(response.text()).rejects.toBe(failure); });
            return new Response();
        });
    });
    it("does not wrap fetch outside the request timing scope", async () => {
        const transport = vi.fn<typeof fetch>();
        const timing = createSelectionProviderTiming(transport);
        expect(timing.fetch).toBe(transport);
        expect(await timing.run(async () => "unchanged")).toBe("unchanged");
    });
});
