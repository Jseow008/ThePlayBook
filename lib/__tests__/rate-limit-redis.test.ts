import { afterEach, expect, it, vi } from "vitest";
import type { Requester } from "@upstash/redis";

const globalDispatcher = Symbol.for("undici.globalDispatcher.1");
const dispatcherBefore = Reflect.get(globalThis, globalDispatcher);
const originalFetch = globalThis.fetch;
const { createRateLimitRedis } = await import("@/lib/server/rate-limit-redis");

const options = { url: "https://redis.example.test", token: "private-test-token" };
const encoded = (value: string) => Buffer.from(value).toString("base64");
const response = (reply: unknown, headers?: HeadersInit) => new Response(JSON.stringify(reply), { headers });
const client = () => createRateLimitRedis(options);
const requester = (redis: ReturnType<typeof client>): Requester => Reflect.get(redis, "client");

afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });

it("keeps the global fetch and dispatcher unchanged on import and construction", () => {
  client();
  expect(globalThis.fetch).toBe(originalFetch);
  expect(Reflect.get(globalThis, globalDispatcher)).toBe(dispatcherBefore);
});

it("preserves SDK command serialization, pipeline decoding and read-your-writes", async () => {
  const fetch = vi.fn()
    .mockResolvedValueOnce(response([{ result: "OK" }, { result: encoded('{"saved":true}') }], { "upstash-sync-token": "sync-1" }))
    .mockResolvedValueOnce(response([{ result: [encoded("unicode ✓"), null, 2, [encoded("nested")]] }], { "upstash-sync-token": "sync-2" }));
  vi.stubGlobal("fetch", fetch);
  const redis = client();
  const [saved, found] = await Promise.all([redis.set("fixture", { saved: true }), redis.get("fixture")]);
  expect(saved).toBe("OK");
  expect(found).toEqual({ saved: true });
  expect(await redis.eval("return ARGV", [], [])).toEqual(["unicode ✓", null, 2, ["nested"]]);
  expect(fetch).toHaveBeenCalledTimes(2);
  const [url, init] = fetch.mock.calls[0];
  expect(url).toBe(`${options.url}/pipeline`);
  expect(JSON.parse(init.body)).toEqual([["set", "fixture", '{"saved":true}'], ["get", "fixture"]]);
  expect(init).toMatchObject({ method: "POST", cache: "no-store", keepalive: true, redirect: "error" });
  expect(init.headers.get("authorization")).toBe(`Bearer ${options.token}`);
  expect(init.headers.get("upstash-encoding")).toBe("base64");
  expect(fetch.mock.calls[1][1].headers.get("upstash-sync-token")).toBe("sync-1");
  expect(fetch.mock.calls[1][1].dispatcher).toBe(init.dispatcher);
  expect(redis.readYourWritesSyncToken).toBe("sync-2");
  expect(globalThis.fetch).toBe(fetch);
  expect(Reflect.get(globalThis, globalDispatcher)).toBe(dispatcherBefore);
});

it("preserves NOSCRIPT errors so the SDK can fall back from EVALSHA to EVAL", async () => {
  const fetch = vi.fn()
    .mockResolvedValueOnce(response([{ error: "NOSCRIPT No matching script. Please use EVAL." }]))
    .mockResolvedValueOnce(response([{ result: [1, 29, 1234] }]));
  vi.stubGlobal("fetch", fetch);
  const script = client().createScript<[number, number, number]>("return {1,29,1234}");
  expect(await script.exec([], [])).toEqual([1, 29, 1234]);
  expect(fetch.mock.calls.map(([, init]) => JSON.parse(init.body)[0][0])).toEqual(["evalsha", "eval"]);
});

it.each(["http://redis.example.test", "https://user:secret@redis.example.test", "https://redis.example.test/other", "https://redis.example.test?token=secret", "invalid secret"])("rejects unsafe or malformed origin configuration: %s", url => {
  expect(() => createRateLimitRedis({ ...options, url })).toThrow(/^Rate-limit Redis requires an HTTPS origin URL\.$/);
});

it("confines credentials to the configured origin and disallows redirects/streaming paths", async () => {
  const fetch = vi.fn().mockResolvedValue(response({ result: "OK" }));
  vi.stubGlobal("fetch", fetch);
  const transport = requester(client());
  for (const path of [["https://other.test"], ["..", "pipeline"], ["pipeline?token=secret"]]) {
    await expect(transport.request({ path, body: [] })).rejects.toThrow("Unsupported");
  }
  await expect(transport.request({ body: [], isStreaming: true })).rejects.toThrow("Unsupported");
  expect(fetch).not.toHaveBeenCalled();
  await transport.request({ body: ["ping"], headers: { authorization: "Bearer other", "upstash-sync-token": "other" } });
  expect(fetch.mock.calls[0][0]).toBe(`${options.url}/`);
  expect(fetch.mock.calls[0][1].headers.get("authorization")).toBe(`Bearer ${options.token}`);
  expect(fetch.mock.calls[0][1].headers.get("upstash-sync-token")).toBe("");
  expect(fetch.mock.calls[0][1].redirect).toBe("error");
});

it("retains five network retries and stops on an aborted request", async () => {
  vi.useFakeTimers();
  const fetch = vi.fn().mockRejectedValue(new TypeError("network failure"));
  vi.stubGlobal("fetch", fetch);
  const transport = requester(client());
  const failure = expect(transport.request({ body: [] })).rejects.toThrow("network failure");
  await vi.runAllTimersAsync();
  await failure;
  expect(fetch).toHaveBeenCalledTimes(6);
  fetch.mockClear();
  await expect(transport.request({ body: [], signal: AbortSignal.abort() })).rejects.toThrow();
  expect(fetch).toHaveBeenCalledTimes(1);
});

it.each([503, 401, 307])("does not retry HTTP %s or include backend credentials/commands in its error", async status => {
  const fetch = vi.fn().mockResolvedValue(new Response(`private ${options.token} command`, { status }));
  vi.stubGlobal("fetch", fetch);
  await expect(requester(client()).request({ body: ["get", "sensitive-key"] })).rejects.toThrow(`Rate-limit Redis HTTP failure (${status}).`);
  expect(fetch).toHaveBeenCalledTimes(1);
});

it.each(["not json", "null", "{}", '{"error":123}'])("rejects malformed upstream response: %s", async body => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(body)));
  await expect(requester(client()).request({ body: [] })).rejects.toThrow(/Invalid rate-limit Redis/);
});
