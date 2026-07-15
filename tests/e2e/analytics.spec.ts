import { expect, test, type Page, type Request } from "@playwright/test";
import { gunzipSync } from "node:zlib";

type CapturedPostHogEvent = {
    event?: string;
    properties?: Record<string, unknown>;
};

function parsePostHogPayload(request: Request): CapturedPostHogEvent[] {
    const bodyBuffer = request.postDataBuffer();
    if (!bodyBuffer) {
        return [];
    }

    if (bodyBuffer[0] === 0x1f && bodyBuffer[1] === 0x8b) {
        try {
            const decoded = JSON.parse(gunzipSync(bodyBuffer).toString("utf8"));
            if (Array.isArray(decoded)) {
                return decoded;
            }
            if (Array.isArray(decoded?.batch)) {
                return decoded.batch;
            }
            if (typeof decoded?.event === "string") {
                return [decoded];
            }
        } catch {
            return [];
        }
    }

    const body = bodyBuffer.toString("utf8");

    try {
        const parsed = JSON.parse(body);
        if (Array.isArray(parsed)) {
            return parsed;
        }
        if (Array.isArray(parsed?.batch)) {
            return parsed.batch;
        }
        if (typeof parsed?.event === "string") {
            return [parsed];
        }
    } catch {
        const params = new URLSearchParams(body);
        const encodedData = params.get("data");
        if (!encodedData) {
            return [];
        }

        try {
            const decoded = JSON.parse(Buffer.from(encodedData, "base64").toString("utf8"));
            if (Array.isArray(decoded)) {
                return decoded;
            }
            if (Array.isArray(decoded?.batch)) {
                return decoded.batch;
            }
            if (typeof decoded?.event === "string") {
                return [decoded];
            }
        } catch {
            return [];
        }
    }

    return [];
}

async function installPostHogCapture(page: Page) {
    const events: CapturedPostHogEvent[] = [];
    const ingestRequests: string[] = [];

    await page.addInitScript(() => {
        Object.defineProperty(Navigator.prototype, "webdriver", {
            get: () => false,
        });
        Object.defineProperty(Navigator.prototype, "userAgentData", {
            get: () => ({
                brands: [
                    { brand: "Chromium", version: "126" },
                    { brand: "Google Chrome", version: "126" },
                ],
                mobile: false,
                platform: "macOS",
            }),
        });
    });

    await page.route("**/flux/**", async (route) => {
        const request = route.request();

        if (request.method() === "GET") {
            const isScriptRequest = new URL(request.url()).pathname.endsWith(".js");
            await route.fulfill({
                status: 200,
                contentType: isScriptRequest ? "application/javascript" : "application/json",
                body: isScriptRequest ? "" : "{}",
            });
            return;
        }

        ingestRequests.push(request.url());
        events.push(...parsePostHogPayload(request));

        await route.fulfill({
            status: 200,
            contentType: "application/json",
            body: JSON.stringify({
                status: 1,
                featureFlags: {},
                featureFlagPayloads: {},
                errorsWhileComputingFlags: false,
            }),
        });
    });

    return { events, ingestRequests };
}

async function waitForEvent(
    page: Page,
    events: CapturedPostHogEvent[],
    eventName: string,
    predicate: (event: CapturedPostHogEvent) => boolean = () => true
) {
    await expect
        .poll(() => events.filter((event) => event.event === eventName && predicate(event)).length, {
            timeout: 20_000,
        })
        .toBeGreaterThan(0);
}

function eventPath(event: CapturedPostHogEvent) {
    return typeof event.properties?.path === "string" ? event.properties.path : null;
}

function isPageviewEvent(event: CapturedPostHogEvent) {
    return event.event === "$pageview" || event.event === "$bot_pageview";
}

test.describe("PostHog analytics verification", () => {
    test.use({
        userAgent:
            "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
    });

    test("tracks first pageview and client navigation pageview once through the same-origin proxy", async ({ page }) => {
        const cspErrors: string[] = [];
        page.on("console", (message) => {
            const text = message.text();
            if (/content security policy|violates.*directive/i.test(text)) {
                cspErrors.push(text);
            }
        });

        const { events, ingestRequests } = await installPostHogCapture(page);
        const response = await page.goto("/");

        expect(response?.headers()["content-security-policy"]).toContain("connect-src 'self'");
        await expect
            .poll(() => events.filter((event) => isPageviewEvent(event) && eventPath(event) === "/").length, {
                timeout: 20_000,
            })
            .toBeGreaterThan(0);

        const browseLink = page.locator('a[href="/browse"]:visible').first();
        await expect(browseLink).toBeVisible();
        await browseLink.click();
        await expect(page).toHaveURL(/\/browse$/);
        await expect
            .poll(() => events.filter((event) => isPageviewEvent(event) && eventPath(event) === "/browse").length, {
                timeout: 20_000,
            })
            .toBeGreaterThan(0);

        const pageviews = events.filter(isPageviewEvent);
        expect(pageviews.filter((event) => eventPath(event) === "/")).toHaveLength(1);
        expect(pageviews.filter((event) => eventPath(event) === "/browse")).toHaveLength(1);
        expect(ingestRequests.some((url) => new URL(url).pathname.startsWith("/flux"))).toBe(true);
        expect(cspErrors).toEqual([]);
    });

    test("tracks client product events without raw private payloads", async ({ page }) => {
        const { events } = await installPostHogCapture(page);

        await page.goto("/login");
        await page.getByLabel("Email address").fill("phase10@example.com");
        await page.getByRole("button", { name: /continue with email/i }).click();
        await waitForEvent(page, events, "signup_started");

        await page.goto("/search?q=phase10");
        await waitForEvent(page, events, "search_performed");

        const signupStarted = events.find((event) => event.event === "signup_started");
        expect(signupStarted?.properties).toMatchObject({
            source: "auth_form",
            auth_method: "email",
            route: "/login",
        });

        const searchPerformed = events.find((event) => event.event === "search_performed");
        expect(searchPerformed?.properties).toMatchObject({
            source: "search_results",
            search_scope: "content",
            query_present: true,
            query_length: 7,
        });
        expect(searchPerformed?.properties).not.toHaveProperty("query");
        expect(searchPerformed?.properties).not.toHaveProperty("raw_query");
        expect(searchPerformed?.properties).not.toHaveProperty("search_query");
    });
});
