import "server-only";
import { beginAskNotesPhase, hasAskNotesTiming } from "@/lib/server/ask-notes-timing";

/** Observed fetch/SDK boundaries, not pure network, inference, or CPU timings. */
export function createSelectionProviderTiming(fetchImplementation: typeof fetch = globalThis.fetch) {
    const enabled = hasAskNotesTiming();
    let finishPreparation: (() => void) | undefined;
    let finishSdk: (() => void) | undefined;
    const timedFetch: typeof fetch = async (input, init) => {
        finishPreparation?.();
        const finishHeaders = beginAskNotesPhase("selection_headers");
        // Starts at fetch dispatch; intentionally overlaps headers and body-read time.
        const finishFirstByte = beginAskNotesPhase("selection_first_byte");
        let response: Response;
        try { response = await fetchImplementation(input, init); }
        finally { finishHeaders(); }
        if (!response.body) return response;
        const finishBody = beginAskNotesPhase("selection_body_read");
        const reader = response.body.getReader();
        let sawBytes = false;
        const body = new ReadableStream<Uint8Array>({
            async pull(controller) {
                try {
                    const result = await reader.read();
                    if (result.done) {
                        finishBody();
                        finishSdk = beginAskNotesPhase("selection_sdk_finish");
                        reader.releaseLock();
                        controller.close();
                    } else {
                        if (!sawBytes && result.value.byteLength > 0) { sawBytes = true; finishFirstByte(); }
                        controller.enqueue(result.value);
                    }
                } catch (error) {
                    // Leave unfinished spans marked incomplete; preserve the original error.
                    reader.releaseLock();
                    controller.error(error);
                }
            },
            async cancel(reason) {
                try { await reader.cancel(reason); } finally { reader.releaseLock(); }
            },
        }, { highWaterMark: 0 });
        const wrapped = new Response(body, { status: response.status, statusText: response.statusText, headers: response.headers });
        for (const key of ["url", "redirected", "type"] as const) Object.defineProperty(wrapped, key, { value: response[key] });
        return wrapped;
    };
    return {
        fetch: enabled ? timedFetch : fetchImplementation,
        async run<T>(work: () => Promise<T>): Promise<T> {
            if (!enabled) return work();
            finishPreparation = beginAskNotesPhase("selection_sdk_prepare");
            try { return await work(); }
            finally { finishPreparation(); finishSdk?.(); }
        },
    };
}
