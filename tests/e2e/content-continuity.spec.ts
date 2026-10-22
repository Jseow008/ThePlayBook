import { test, expect } from "@playwright/test";
import { Client } from "pg";
import { randomUUID } from "node:crypto";
import { config } from "dotenv";
import { createClient } from "@supabase/supabase-js";

config({ path: ".env.local", quiet: true });
const databaseUrl = process.env.CONTENT_CONTINUITY_DATABASE_URL;
const sourceId = randomUUID();
const keptId = randomUUID();
const segmentId = randomUUID();
const email = `continuity-${randomUUID()}@example.invalid`;
const password = randomUUID();
let adminId: string;
let db: Client;

// This fixture writes only to explicitly selected disposable environments.
test.describe("replacement continuity", () => {
    test.describe.configure({ mode: "serial", timeout: 90_000 });
    test.skip(!databaseUrl, "Requires CONTENT_CONTINUITY_DATABASE_URL and a matching disposable app");
    test.beforeAll(async () => {
        if (!["localhost", "127.0.0.1"].includes(new URL(databaseUrl!).hostname)) throw new Error("Local disposable database required");
        if (!["localhost", "127.0.0.1"].includes(new URL(process.env.NEXT_PUBLIC_SUPABASE_URL!).hostname)) throw new Error("Local disposable auth required");
        db = new Client({ connectionString: databaseUrl });
        await db.connect();
        const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_KEY!);
        const created = await admin.auth.admin.createUser({ email, password, email_confirm: true });
        if (created.error || !created.data.user) throw created.error ?? new Error("Fixture user missing");
        adminId = created.data.user.id;
        await db.query("UPDATE public.profiles SET role='admin' WHERE id=$1", [adminId]);
        await db.query(`INSERT INTO public.content_item(id,type,title,status,category,quick_mode_json)
            VALUES ($1,'book',$3,'verified','Productivity',$5), ($2,'book',$4,'verified','Productivity',$5)`,
        [sourceId, keptId, `Original continuity ${sourceId}`, `Updated continuity ${keptId}`, { hook: "Fixture", big_idea: "Fixture", key_takeaways: ["Fixture"] }]);
        await db.query(`INSERT INTO public.user_reflections(user_id,content_item_id,prompt,reflection_text)
            VALUES ($1,$2,'Original','Original retained reflection'),($1,$3,'Kept','Unrelated kept reflection')`, [adminId,sourceId,keptId]);
        await db.query(`INSERT INTO public.segment(id,item_id,order_index,title,markdown_body)
            VALUES ($1,$2,0,'Original section','Original passage'), ($3,$4,0,'New section','New passage')`, [segmentId, sourceId, randomUUID(), keptId]);
    });
    test.afterAll(async () => {
        if (!db) return;
        if (adminId) {
            const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_KEY!);
            const { error } = await admin.auth.admin.deleteUser(adminId);
            if (error) throw error;
        }
        await db.query("DELETE FROM public.content_replacement WHERE source_id=$1", [sourceId]);
        await db.query("DELETE FROM public.content_item WHERE id=ANY($1::uuid[])", [[sourceId, keptId]]);
        await db.end();
    });
    test("replacement retains original reflections and explicit library controls", async ({ page, context }, info) => {
        const { createServerClient } = await import("@supabase/ssr");
        const auth = createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
            cookies: { getAll: () => [], setAll: (cookies: Array<{ name: string; value: string }>) => {
                // Cookies are applied after sign-in below.
                pendingCookies.push(...cookies.map((cookie) => ({ name: cookie.name, value: cookie.value })));
            } },
        });
        const pendingCookies: Array<{ name: string; value: string }> = [];
        const signedIn = await auth.auth.signInWithPassword({ email, password });
        if (signedIn.error) throw signedIn.error;
        await context.addCookies(pendingCookies.map((cookie) => ({ ...cookie, url: info.project.use.baseURL as string })));
        await page.goto(`/admin/content/${sourceId}/edit`);
        await page.getByText("Replace a duplicate summary", { exact: true }).click();
        await page.getByLabel("Kept summary", { exact: true }).selectOption(keptId);
        await page.getByRole("button", { name: "Preview replacement", exact: true }).click();
        await expect(page.getByText(/Preserve 0 library records/)).toBeVisible();
        await page.getByRole("button", { name: "Confirm replacement", exact: true }).click();
        await expect(page).toHaveURL(/\/admin\/content$/);
        await page.goto(`/read/${sourceId}`);
        const scopedReflectionResponse = page.waitForResponse((response) => response.url().includes(`/api/library/reflections?content_item_id=${sourceId}`));
        await page.getByRole("link", { name: "View original notes" }).click();
        const scopedReflectionResult = await scopedReflectionResponse;
        expect(scopedReflectionResult.ok()).toBe(true);
        const scopedReflectionBody = await scopedReflectionResult.json();
        expect(scopedReflectionBody.data.map((reflection: { content_item_id: string }) => reflection.content_item_id)).toEqual([sourceId]);
        await expect(page.getByText("Original retained reflection", { exact: true })).toBeVisible();
        await expect(page.getByText("Unrelated kept reflection", { exact: true })).not.toBeVisible();
        await page.getByRole("button", { name: "Reflections", exact: true }).first().click();
        await expect(page.getByText("Original retained reflection", { exact: true })).toBeVisible();
        await context.clearCookies();
        await page.addInitScript(({ oldId, targetId, oldSegment }) => {
            if (localStorage.getItem("continuity_fixture_seeded")) return;
            localStorage.setItem("continuity_fixture_seeded", "1");
            const now = new Date().toISOString();
            localStorage.setItem(`netflux_progress_guest_${oldId}`, JSON.stringify({
                itemId: oldId, completed: [oldSegment], lastSegmentIndex: 0, lastReadAt: now, isCompleted: false, totalSegments: 4,
            }));
            localStorage.setItem(`netflux_progress_guest_${targetId}`, JSON.stringify({
                itemId: targetId, completed: [], lastSegmentIndex: 0, lastReadAt: now, isCompleted: false, totalSegments: 2,
            }));
            localStorage.setItem(`netflux_audio_resume_guest_${oldId}`, JSON.stringify({ currentTimeSec: 123, lastUpdatedAt: now, audioSource: "original.mp3" }));
            localStorage.setItem("netflux_mylist_guest", JSON.stringify([oldId]));
        }, { oldId: sourceId, targetId: keptId, oldSegment: segmentId });
        await page.goto("/library/reading");
        await expect(page.getByRole("region", { name: "Unavailable saved summaries" })).toBeVisible();
        await expect(page.getByText("1 of 4 sections completed")).toBeVisible();
        await page.getByRole("link", { name: "View summary status" }).click();
        await expect(page.getByRole("heading", { name: "This summary has been replaced" })).toBeVisible();
        await expect(page.getByRole("link", { name: "Open updated summary" })).toHaveAttribute("href", new RegExp(`/read/${keptId}/[^?]+$`));
        await expect(page.getByText(/Reading and listening positions are separate/)).toBeVisible();
        expect(await page.evaluate((id) => JSON.parse(localStorage.getItem(`netflux_audio_resume_guest_${id}`)!).currentTimeSec, sourceId)).toBe(123);
        expect(await page.evaluate((id) => JSON.parse(localStorage.getItem(`netflux_progress_guest_${id}`)!).completed, sourceId)).toEqual([segmentId]);
        expect(await page.evaluate((id) => JSON.parse(localStorage.getItem(`netflux_progress_guest_${id}`)!).completed, keptId)).toEqual([]);
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
        await page.screenshot({ path: test.info().outputPath("replacement-notice.png"), fullPage: true });
        await page.getByRole("link", { name: "Back to library" }).click();
        await expect(page.getByRole("region", { name: "Unavailable saved summaries" }).getByRole("button", { name: "Hide from Continue Reading", exact: true })).toBeVisible();
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
        await page.screenshot({ path: test.info().outputPath("unavailable-actions.png"), fullPage: true });
        await page.getByRole("region", { name: "Unavailable saved summaries" }).getByRole("button", { name: "Hide from Continue Reading", exact: true }).click();
        expect(await page.evaluate((id) => JSON.parse(localStorage.getItem(`netflux_progress_guest_${id}`)!).archivedFromLists.reading, sourceId)).toBe(true);
        await page.getByRole("button", { name: "Undo", exact: true }).last().click();
        await expect(page.getByRole("link", { name: "View summary status" })).toBeVisible();
        await page.goto("/library/my-list");
        await page.getByRole("button", { name: "Remove from Saved", exact: true }).click();
        expect(await page.evaluate(() => JSON.parse(localStorage.getItem("netflux_mylist_guest")!))).toEqual([]);
        expect(await page.evaluate((id) => JSON.parse(localStorage.getItem(`netflux_progress_guest_${id}`)!).completed, sourceId)).toEqual([segmentId]);
        await page.evaluate((id) => {
            const key = `netflux_progress_guest_${id}`;
            const progress = JSON.parse(localStorage.getItem(key)!);
            localStorage.setItem(key, JSON.stringify({ ...progress, isCompleted: true }));
        }, sourceId);
        await page.goto("/library/completed");
        await page.getByRole("region", { name: "Unavailable saved summaries" }).getByRole("button", { name: "Hide from Completed", exact: true }).click();
        expect(await page.evaluate((id) => JSON.parse(localStorage.getItem(`netflux_progress_guest_${id}`)!).archivedFromLists.completed, sourceId)).toBe(true);
        expect(await page.evaluate((id) => JSON.parse(localStorage.getItem(`netflux_audio_resume_guest_${id}`)!).currentTimeSec, sourceId)).toBe(123);
    });
});
