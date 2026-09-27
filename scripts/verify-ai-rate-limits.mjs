/** Hosted ingress proof. All bodies are deliberately invalid JSON: no AI calls.
 * Requires two disposable signed-in sessions in a private JSON file:
 * { primary: "cookie header", secondary: "cookie header" }.
 * Run once per fresh network window. Never flush live Redis to repeat a proof.
 */
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const base = new URL(process.env.AI_RATE_TEST_URL ?? "");
assert.equal(base.protocol, "https:", "Use a hosted HTTPS deployment");
const sessions = JSON.parse(await readFile(process.env.AI_RATE_TEST_COOKIE_FILE, "utf8"));
assert.ok(sessions.primary && sessions.secondary && sessions.primary !== sessions.secondary, "Two distinct disposable accounts required");
let attempt = 0;
const results = [];
async function probe(path, cookie) {
    attempt++;
    const fake = `192.0.2.${(attempt % 250) + 1}`;
    const response = await fetch(new URL(path, base), {
        method: "POST", redirect: "manual", signal: AbortSignal.timeout(15_000),
        headers: {
            "content-type": "application/json", "cf-connecting-ip": fake,
            "x-real-ip": fake, "x-forwarded-for": `${fake}, 198.51.100.1`,
            "x-vercel-forwarded-for": fake,
            ...(cookie ? { cookie } : {}),
            ...(process.env.VERCEL_AUTOMATION_BYPASS_SECRET ? { "x-vercel-protection-bypass": process.env.VERCEL_AUTOMATION_BYPASS_SECRET } : {}),
        },
        body: "{",
    });
    const body = await response.json().catch(() => ({}));
    const result = { path, status: response.status, code: body.error?.code, retryAfter: response.headers.get("retry-after") };
    results.push(result);
    return result;
}
function rejected(result) {
    assert.equal(result.status, 429); assert.equal(result.code, "RATE_LIMITED");
    assert.ok(Number(result.retryAfter) >= 1);
}
function admitted(result) {
    assert.equal(result.status, 400); assert.equal(result.code, "INVALID_JSON");
}
try {
    const start = Date.now();
    // Exact boundary assertions need one current minute, not an approximate
    // sliding-window transition. Wait externally for a fresh early-minute window.
    assert.ok(start % 60_000 < 20_000, "Start within the first 20 seconds of a fresh minute");
    for (let i = 0; i < 3; i++) admitted(await probe("/api/chat/author"));
    rejected(await probe("/api/chat/author"));
    const routes = ["/api/chat", "/api/chat/notes", "/api/chat/author"];
    for (const route of routes) {
        (await Promise.all(Array.from({ length: 10 }, () => probe(route, sessions.primary)))).forEach(admitted);
        rejected(await probe(route, sessions.primary));
        admitted(await probe(route, sessions.secondary));
    }
    // Count 40 so far. Rejected guest attempts also count toward network protection.
    for (let i = 0; i < 20; i++) rejected(await probe("/api/chat/author"));
    // This account still has nine attempts per route, but the network is exhausted.
    for (const route of routes) rejected(await probe(route, sessions.secondary));
    assert.equal(Math.floor(start / 60_000), Math.floor(Date.now() / 60_000), "Window crossed; evidence is inconclusive");
    console.log(JSON.stringify({ passed: true, origin: base.origin, attempts: attempt, elapsedMs: Date.now() - start, results }, null, 2));
} catch (error) {
    console.error(JSON.stringify({ passed: false, origin: base.origin, attempts: attempt, results }, null, 2));
    throw error;
}
