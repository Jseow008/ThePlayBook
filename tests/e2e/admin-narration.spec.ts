import { expect, test } from "@playwright/test";
import {
    GUEST_ONBOARDING_STORAGE_KEY,
    createGuestOnboardingEntry,
} from "@/lib/onboarding";
import { getAdminPublishE2EConfig } from "./helpers/admin-publish";

const adminPublishConfig = getAdminPublishE2EConfig();

function escapeRegExp(value: string) {
    return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

test.describe("Admin narration flow", () => {
    test.describe.configure({ mode: "serial" });
    test.skip(Boolean(adminPublishConfig.skipReason), adminPublishConfig.skipReason ?? undefined);

    test("admin can generate narration and play it on the read page", async ({ page }) => {
        test.slow();
        test.setTimeout(240_000);

        const uniqueToken = `pw-narration-${Date.now()}`;
        const title = `Playwright Narration ${uniqueToken}`;
        const author = "Codex QA";
        const segmentTitle = `Narration Segment ${uniqueToken}`;
        const segmentBody = [
            "This E2E entry validates AI narration playback on the public reader.",
            "The script is intentionally short to keep generation cost and runtime low.",
            "Playback should start from the real audio asset stored for the content item.",
        ].join(" ");

        await page.goto("/admin-login");
        await page.getByPlaceholder("Email address").fill(adminPublishConfig.email!);
        await page.getByPlaceholder("Password").fill(adminPublishConfig.password!);
        await page.getByRole("button", { name: "Sign In" }).click();

        await page.waitForURL(/\/admin(?:\?.*)?$/, { timeout: 20_000 });
        await expect(
            page.getByRole("heading", { name: "Content Dashboard" })
        ).toBeVisible();

        await page.getByRole("link", { name: /New Content/i }).click();
        await page.waitForURL(/\/admin\/content\/new$/, { timeout: 15_000 });
        await expect(page.getByRole("heading", { name: "New Content" })).toBeVisible();

        await page.getByPlaceholder("Enter content title").fill(title);
        await page.getByPlaceholder("Author name").fill(author);
        await page
            .locator("section")
            .filter({ hasText: "Basic Information" })
            .locator("select")
            .first()
            .selectOption("Business");
        await page.getByPlaceholder("https://...").fill(`https://example.com/${uniqueToken}`);
        await page
            .getByPlaceholder("Or paste image URL directly...")
            .fill(adminPublishConfig.coverImageUrl);

        await page
            .getByPlaceholder("One attention-grabbing sentence")
            .fill(`Hook for ${title}`);
        await page
            .getByPlaceholder("The core thesis or main takeaway")
            .fill(`Big idea for ${title}`);
        await page.getByPlaceholder("Takeaway 1").fill(`Takeaway 1 ${uniqueToken}`);
        await page.getByPlaceholder("Takeaway 2").fill(`Takeaway 2 ${uniqueToken}`);
        await page.getByPlaceholder("Takeaway 3").fill(`Takeaway 3 ${uniqueToken}`);

        await page.getByRole("button", { name: "Add Segment" }).click();
        await page.getByPlaceholder("Segment title").fill(segmentTitle);
        await page
            .getByPlaceholder("Write segment content in Markdown...")
            .fill(segmentBody);

        await page.getByRole("button", { name: "Publish" }).click();
        await page.waitForURL(/\/admin(?:\?.*)?$/, { timeout: 20_000 });
        await page.goto(`/admin?q=${encodeURIComponent(uniqueToken)}`);

        const row = page.locator("div.grid").filter({
            has: page.getByText(title, { exact: true }),
        });
        await expect(row).toHaveCount(1, { timeout: 15_000 });

        const editLink = row.locator('a[title="Edit"]');
        await expect(editLink).toBeVisible();

        const editHref = await editLink.getAttribute("href");
        expect(editHref).toBeTruthy();

        const contentIdMatch = editHref?.match(/\/admin\/content\/([^/]+)\/edit$/);
        expect(contentIdMatch?.[1]).toBeTruthy();
        const contentId = contentIdMatch![1];

        await page.goto(editHref!);
        await page.waitForURL(new RegExp(`/admin/content/${escapeRegExp(contentId)}/edit$`), {
            timeout: 15_000,
        });

        const generateButton = page.getByRole("button", { name: /generate ai narration/i });
        await expect(generateButton).toBeVisible();
        await generateButton.click();

        await expect(
            page.getByText(/generation will continue in the background/i)
        ).toBeVisible({ timeout: 15_000 });

        for (let attempt = 0; attempt < 6; attempt += 1) {
            const processResponse = await page.request.post("/api/admin/narration/process");
            expect(processResponse.ok()).toBeTruthy();

            const readyMessage = page.getByText(/ai narration is ready/i);
            try {
                await expect(readyMessage).toBeVisible({ timeout: 30_000 });
                break;
            } catch (error) {
                if (attempt === 5) {
                    throw error;
                }
            }
        }

        const adminAudioPreview = page.locator("audio").last();
        await expect(adminAudioPreview).toHaveAttribute("src", /generated\/.*\/ai-narration\.wav/);

        await page.addInitScript(
            ([storageKey, onboardingState]) => {
                window.localStorage.setItem(storageKey, JSON.stringify(onboardingState));
            },
            [
                GUEST_ONBOARDING_STORAGE_KEY,
                createGuestOnboardingEntry("completed"),
            ]
        );

        await page.goto(`/read/${contentId}`);
        await expect(page.getByText(segmentTitle, { exact: true })).toBeVisible({
            timeout: 20_000,
        });

        const readAudio = page.locator("audio").first();
        await expect(readAudio).toHaveAttribute("src", /generated\/.*\/ai-narration\.wav/);

        const playButton = page.getByRole("button", { name: "Play" }).first();
        await expect(playButton).toBeVisible();
        await playButton.click();

        await expect(page.getByRole("button", { name: "Pause" }).first()).toBeVisible({
            timeout: 10_000,
        });

        await page.waitForFunction(() => {
            const audio = document.querySelector("audio");
            return Boolean(audio && !audio.paused && audio.currentTime > 0.1);
        }, undefined, { timeout: 15_000 });

        await expect(
            page.getByText(/could not be played|not supported|network error|could not be decoded/i)
        ).toHaveCount(0);
    });
});
