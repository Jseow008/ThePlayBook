import { AsyncLocalStorage } from "node:async_hooks";
import assert from "node:assert/strict";

/** Supply only the browser origin the export client needs; retain its real verifier. */
export function installOverlayRuntime(origin: string, maximumRequests = 200, protectionBypass?: string) {
    assert(new URL(origin).origin === origin && origin.startsWith("https://"), "Invalid overlay origin");
    const originalFetch = globalThis.fetch;
    const originalWindow = Object.getOwnPropertyDescriptor(globalThis, "window");
    const context = new AsyncLocalStorage<{ cookie: string; signal: AbortSignal }>();
    let requests = 0;
    Object.defineProperty(globalThis, "window", { configurable: true, value: { location: { origin } } });
    globalThis.fetch = async (input, init) => {
        const active = context.getStore();
        assert(active, "Missing user request scope");
        assert(typeof input === "string" || input instanceof URL, "Unsupported overlay request");
        assert(typeof input !== "string" || !input.startsWith("//"), "Network-relative overlay request refused");
        const url = new URL(input, origin);
        assert(url.origin === origin && !url.username && !url.password, "Overlay target changed");
        assert(++requests <= maximumRequests, "Overlay request bound");
        const headers = new Headers(init?.headers);
        headers.set("cookie", active.cookie);
        if (protectionBypass) headers.set("x-vercel-protection-bypass", protectionBypass);
        const response = await originalFetch(url, {
            ...init, headers, redirect: "manual",
            signal: AbortSignal.any([active.signal, ...(init?.signal ? [init.signal] : [])]),
        });
        assert(response.url && new URL(response.url).origin === origin
            && !(response.status >= 300 && response.status < 400), "Overlay target changed");
        return response;
    };
    return {
        runAs<T>(cookie: string, signal: AbortSignal, work: () => Promise<T>) {
            return context.run({ cookie, signal }, work);
        },
        get requests() { return requests; },
        restore() {
            globalThis.fetch = originalFetch;
            if (originalWindow) Object.defineProperty(globalThis, "window", originalWindow);
            else Reflect.deleteProperty(globalThis, "window");
        },
    };
}

type Fixture = {
    library: { content_id: string }[];
    reflections: { id: string; content_item_id: string; prompt: string; reflection_text: string }[];
};

/** Export payloads intentionally omit user_id. Verify exact run-owned fixture identities. */
export function verifyOverlayFixture(data: Record<string, Record<string, unknown>[]>, user: Fixture) {
    const library = data.user_library;
    assert(library.length === user.library.length
        && new Set(library.map(row => row.content_id)).size === library.length
        && library.every(row => user.library.some(expected => expected.content_id === row.content_id)), "Export library fixture mismatch");
    const reflections = data.reflections;
    assert(reflections.length === user.reflections.length
        && new Set(reflections.map(row => row.id)).size === reflections.length
        && reflections.every(row => user.reflections.some(expected => expected.id === row.id
            && expected.content_item_id === row.content_item_id && expected.prompt === row.prompt
            && expected.reflection_text === row.reflection_text)), "Export reflection fixture mismatch");
}
