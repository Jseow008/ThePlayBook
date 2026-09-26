import { test, expect, chromium, webkit } from "@playwright/test";
import { readFileSync } from "node:fs";

// Authenticated browser proof uses a disposable fixture containing server-issued
// links and ordinary-user cookies. Never point this suite at production.
const fixturePath = process.env.CITATION_BROWSER_FIXTURE;
const origin = process.env.PLAYWRIGHT_BASE_URL || "http://localhost:3100";
if (fixturePath && !["localhost", "127.0.0.1"].includes(new URL(origin).hostname)) throw new Error("Citation browser proof requires a disposable local server");
for (const [name, engine, viewport] of [
    ["Chromium desktop", chromium, { width: 1440, height: 900 }],
    ["WebKit mobile", webkit, { width: 390, height: 844 }],
] as const) {
    test(`verified passage navigation, keyboard and logout: ${name}`, async ({}, testInfo) => {
        test.setTimeout(60_000);
        test.skip(!fixturePath || testInfo.project.name !== "desktop-chromium", "Requires one disposable authenticated citation fixture");
        const fixture = JSON.parse(readFileSync(fixturePath!, "utf8")) as {
            cookies: { name: string; value: string }[]; link: { href: string }; text: string;
        };
        const browser = await engine.launch();
        const context = await browser.newContext({ viewport });
        const page = await context.newPage();
        const errors: string[] = [];
        page.on("pageerror", (error) => errors.push(error.message));
        await context.addCookies(fixture.cookies.map((cookie) => ({ name: cookie.name, value: cookie.value, url: origin })));
        try {
            await page.goto(`${origin}${fixture.link.href}`);
            await expect(page.locator("mark")).toHaveText(fixture.text, { timeout: 45_000 });
            await expect(page.getByRole("heading", { name: "Verified passage", exact: true })).toBeFocused();
            expect(new URL(page.url()).hash).toBe("");
            await page.keyboard.press(name.startsWith("WebKit") ? "Alt+Tab" : "Tab");
            await expect(page.getByRole("link", { name: "Read source", exact: true })).toBeFocused();
            await page.evaluate(() => { document.documentElement.style.fontSize = "200%"; });
            expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
            await expect(page.locator("mark")).toHaveText(fixture.text);
            await page.screenshot({ path: testInfo.outputPath("passage.png"), fullPage: true });
            // Removing this browser's cookies then reloading represents no active login;
            // actual server-side revocation is separately covered by database fixtures.
            await context.clearCookies();
            await page.reload();
            await expect(page.getByRole("link", { name: "Sign in", exact: true })).toBeVisible();
            await expect(page.locator("mark")).toHaveCount(0);
            expect(errors).toEqual([]);
        } finally { await context.close(); await browser.close(); }
    });
}
