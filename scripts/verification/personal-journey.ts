/** #26: explicit, non-skipping production-build proof; only disposable loopback data. */
import { strict as assert } from "node:assert";
import { randomUUID } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { chromium, expect, type BrowserContext } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { Pool } from "pg";

const required = (key: string) => {
    const value = process.env[key];
    if (!value) throw new Error(`Missing prerequisite: ${key}`);
    return value;
};
const local = (key: string) => {
    const value = required(key);
    assert(["localhost", "127.0.0.1", "[::1]"].includes(new URL(value).hostname), `${key} must be disposable loopback`);
    return value;
};

async function main() {
    assert.equal(process.env.JOURNEY_OWNED_SERVER, "1", "Use run-personal-journey.mjs to bind the build and server configuration");
    const origin = local("JOURNEY_BASE_URL");
    const api = local("NEXT_PUBLIC_SUPABASE_URL");
    const database = local("JOURNEY_DATABASE_URL");
    const buildId = readFileSync(".next/BUILD_ID", "utf8").trim();
    assert(buildId, "Build the production application before this journey");
    const output = required("JOURNEY_EVIDENCE_PATH");
    const admin = createClient(api, required("SUPABASE_SERVICE_KEY"), { auth: { persistSession: false, autoRefreshToken: false } });
    const cronSecret = required("CRON_SECRET");
    const db = new Pool({ connectionString: database });
    const browser = await chromium.launch();
    const email = `journey-${randomUUID()}@example.com`;
    const contentId = randomUUID(), segmentId = randomUUID();
    const title = "Synthetic journey: the lantern pause";
    const reflection = "My lantern pause is to stop before replying, write one clear question, and listen for the answer before offering advice.";
    const stages: { name: string; elapsedMs: number }[] = [];
    let stage = "setup", started = Date.now(), userId: string | undefined;
    let exportCollections = 0;
    let journeyError: unknown;
    let originalPolicy: { enabled: boolean; daily_limit_microusd: string; guest_daily_limit_microusd: string } | undefined;
    const completed = () => { stages.push({ name: stage, elapsedMs: Date.now() - started }); console.log(`PASS ${stage}`); };
    const begin = (name: string) => { stage = name; started = Date.now(); };
    const contexts: BrowserContext[] = [];
    const seenSessionIds = new Set<string>();
    const login = async (destination: string) => {
        const context = await browser.newContext({ baseURL: origin, viewport: { width: 1440, height: 1000 },
            extraHTTPHeaders: { "x-vercel-forwarded-for": `2001:db8:26:${randomUUID().slice(0, 4)}::1`, "x-forwarded-host": new URL(origin).host, "x-forwarded-proto": "http" } });
        contexts.push(context);
        const page = await context.newPage();
        page.setDefaultTimeout(30_000);
        await page.goto(`/login?next=${encodeURIComponent(destination)}`);
        await page.getByLabel("Email address", { exact: true }).fill(email);
        await page.getByRole("button", { name: "Continue with Email", exact: true }).click();
        await expect(page.getByLabel("Verification code", { exact: true })).toBeVisible();
        // Synthetic mailbox substitute only: real Supabase OTP, consumed by the real UI/verify route.
        const link = await admin.auth.admin.generateLink({ type: "magiclink", email });
        assert(!link.error && link.data.properties.email_otp, "Disposable OTP creation failed");
        await page.getByLabel("Verification code", { exact: true }).fill(link.data.properties.email_otp);
        await page.getByRole("button", { name: "Verify and continue", exact: true }).click();
        await page.waitForURL(url => url.pathname === "/welcome" || url.href === new URL(destination, origin).href);
        if (new URL(page.url()).pathname === "/welcome") {
            await page.getByRole("button", { name: "Explore the library", exact: true }).click();
        }
        await page.waitForURL(url => url.href === new URL(destination, origin).href || (destination.startsWith("/read/") && url.pathname.startsWith(`${destination}/`)));
        const sessions = await db.query("SELECT id FROM auth.sessions WHERE user_id=$1", [userId]);
        assert.equal(sessions.rowCount, 1, "Exactly one fresh session must exist");
        assert(!seenSessionIds.has(sessions.rows[0].id), "Later session must not reuse earlier credentials");
        seenSessionIds.add(sessions.rows[0].id);
        console.log("  authenticated destination reached");
        return page;
    };
    try {
        originalPolicy = (await db.query("SELECT enabled,daily_limit_microusd,guest_daily_limit_microusd FROM private.ai_spend_policy WHERE singleton")).rows[0];
        await db.query("UPDATE private.ai_spend_policy SET enabled=true,daily_limit_microusd=5000000,guest_daily_limit_microusd=1000000 WHERE singleton");
        const created = await admin.auth.admin.createUser({ email, email_confirm: true });
        assert(!created.error && created.data.user, "Ordinary fixture account creation failed");
        userId = created.data.user.id;
        const profile = await db.query("SELECT role FROM public.profiles WHERE id=$1", [userId]);
        assert.equal(profile.rows[0]?.role, "user", "Journey must run as ordinary user");
        await db.query("INSERT INTO public.content_item(id,type,title,author,status) VALUES($1,'article',$2,'Synthetic author','verified')", [contentId, title]);
        await db.query("INSERT INTO public.segment(id,item_id,order_index,title,markdown_body) VALUES($1,$2,0,'Pause and listen','A brief pause can make space for a clear question and a thoughtful answer.')", [segmentId, contentId]);
        completed();
        begin("first-session capture through browser");
        let page = await login(`/read/${contentId}`);
        await page.getByRole("button", { name: `Save ${title} to Library`, exact: true }).click();
        await expect(page.getByRole("button", { name: `Remove ${title} from Library`, exact: true })).toBeVisible();
        console.log("  bookmark saved");
        const segment = page.locator(`[data-reader-segment-id="${segmentId}"] > button`);
        if (await segment.getAttribute("aria-expanded") === "false") await segment.click();
        await page.getByRole("button", { name: "Finish Reading", exact: true }).click();
        console.log("  reading completed");
        await page.getByRole("button", { name: /Write a reflection/ }).click();
        await page.getByPlaceholder("A few sentences is enough.").fill(reflection);
        await page.getByRole("button", { name: "Save reflection", exact: true }).click();
        await expect.poll(async () => (await db.query("SELECT count(*)::int AS n FROM public.user_reflections WHERE user_id=$1 AND reflection_text=$2", [userId, reflection])).rows[0].n).toBe(1);
        completed();
        begin("real personal-evidence indexing");
        const indexed = await page.request.get("/api/admin/personal-evidence/process", { headers: { authorization: `Bearer ${cronSecret}` }, timeout: 60_000 });
        assert.equal(indexed.status(), 200, "Actual indexing worker must succeed");
        const indexedBody = await indexed.json();
        assert.equal(indexedBody.data.completed, 1, "Worker must index the browser-created reflection");
        completed();
        begin("logout and later fresh session");
        await page.goto("/settings");
        await page.getByRole("button", { name: /Sign Out/ }).click();
        await page.waitForURL(/\/login/);
        await expect.poll(async () => (await db.query("SELECT count(*)::int AS n FROM auth.sessions WHERE user_id=$1", [userId])).rows[0].n).toBe(0);
        await page.context().close();
        page = await login("/notes?type=reflection");
        await expect(page.getByText(reflection, { exact: true }).first()).toBeVisible();
        completed();
        begin("real retrieval and attributed extract");
        await page.getByRole("button", { name: "Ask these notes", exact: true }).click();
        await page.getByLabel("Ask a question about the notes in view", { exact: true }).fill("Quote my exact reflection about the lantern pause.");
        const responsePromise = page.waitForResponse(r => r.url().endsWith("/api/chat/notes") && r.request().method() === "POST", { timeout: 90_000 });
        await page.getByLabel("Send notes question", { exact: true }).click();
        const response = await responsePromise;
        if (response.status() !== 200) {
            const failure = await response.json().catch(() => ({}));
            assert.fail(`Real retrieval failed: HTTP ${response.status()} / ${failure.error?.code ?? "unknown"}`);
        }
        const stream = await response.text();
        const events = stream.split("\n").filter(line => line.startsWith("data: ") && !line.includes("[DONE]")).map(line => JSON.parse(line.slice(6)));
        assert.equal(events.filter(event => event.type === "text-delta").map(event => event.delta).join(""), reflection);
        assert(events.some(event => event.type === "data-exact-quotation" && event.data === true));
        assert(stream.includes('"finishReason":"stop"'), "Retrieval must finish explicitly");
        const citations = page.getByRole("navigation", { name: "Supporting passages" });
        await expect(citations).toBeVisible({ timeout: 90_000 });
        await expect(citations.locator("..").getByText(reflection, { exact: true })).toBeVisible();
        completed();
        begin("validated citation opens exact passage");
        const popupPromise = page.waitForEvent("popup");
        await citations.getByRole("link").first().click();
        const popup = await popupPromise;
        await expect(popup.getByRole("heading", { name: "Verified passage" })).toBeVisible();
        await expect(popup.locator("mark")).toHaveText(reflection);
        await expect(popup.getByRole("link", { name: "Read source", exact: true })).toBeVisible();
        await popup.close();
        completed();
        begin("settings export reconciles original capture");
        await page.goto("/settings");
        const downloadPromise = page.waitForEvent("download", { timeout: 120_000 });
        await page.getByRole("button", { name: /Download My Data/ }).click();
        const download = await downloadPromise;
        const path = await download.path();
        assert(path, "Export download must exist");
        const exported = JSON.parse(readFileSync(path, "utf8"));
        const saved = exported.data.user_library.filter((row: { content_id: string }) => row.content_id === contentId);
        assert.equal(saved.length, 1);
        assert.equal(saved[0].is_bookmarked, true);
        const reflections = exported.data.reflections.filter((row: { reflection_text: string }) => row.reflection_text === reflection);
        assert.equal(reflections.length, 1);
        assert.equal(reflections[0].content_item_id, contentId);
        assert(exported.snapshot.id && exported.snapshot.collection_manifests);
        completed();
        exportCollections = Object.keys(exported.data).length;
    } catch (error) {
        writeFileSync(output, JSON.stringify({ outcome: "failed", buildId, stage, stages, recordedAt: new Date().toISOString() }, null, 2));
        // Do not print browser messages/streams/cookies/provider bodies in failure logs.
        writeFileSync(`${output}.failure.txt`, error instanceof Error ? error.message : "Unknown failure", { mode: 0o600 });
        console.error(`Journey failed at: ${stage}; ${error instanceof Error ? error.name : "unknown error"}`);
        journeyError = error;
    } finally {
        const cleanup = await Promise.allSettled([
            originalPolicy ? db.query("UPDATE private.ai_spend_policy SET enabled=$1,daily_limit_microusd=$2,guest_daily_limit_microusd=$3 WHERE singleton", [originalPolicy.enabled, originalPolicy.daily_limit_microusd, originalPolicy.guest_daily_limit_microusd]) : Promise.resolve(),
            Promise.all(contexts.map(context => context.close())).then(() => browser.close()),
            db.query("DELETE FROM public.content_item WHERE id=$1", [contentId]),
            userId ? admin.auth.admin.deleteUser(userId).then(result => { assert(!result.error, "Fixture user cleanup failed"); }) : Promise.resolve(),
        ]);
        const cleanupFailures = cleanup.filter(result => result.status === "rejected").length;
        try {
            assert.equal(cleanupFailures, 0, "Fixture cleanup failed");
            const remaining = await db.query("SELECT (SELECT count(*) FROM public.content_item WHERE id=$1) + (SELECT count(*) FROM auth.users WHERE id=$2) AS n", [contentId, userId ?? null]);
            assert.equal(Number(remaining.rows[0].n), 0, "Fixture records remain");
        } catch (error) { journeyError ??= error; stage = "cleanup"; }
        finally { await db.end(); }
    }
    writeFileSync(output, JSON.stringify({ outcome: journeyError ? "failed" : "journey_passed", failedStage: journeyError ? stage : null, buildId, recordedAt: new Date().toISOString(), stages, authenticatedSessions: seenSessionIds.size, mockedRetrieval: false, exportCollections, fixtureCleanupVerified: stage !== "cleanup" }, null, 2));
    if (journeyError) throw new Error(`Required journey failed: ${stage}`);
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
