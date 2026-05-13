import { expect, test } from "@playwright/test";
import {
    GUEST_ONBOARDING_STORAGE_KEY,
    createGuestOnboardingEntry,
} from "@/lib/onboarding";
import {
    createImageUploadFixture,
    getAdminPublishE2EConfig,
} from "./helpers/admin-publish";

const adminPublishConfig = getAdminPublishE2EConfig();

function escapeRegExp(value: string) {
    return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

test.describe("Admin publish flow", () => {
    test.describe.configure({ mode: "serial" });
    test.skip(Boolean(adminPublishConfig.skipReason), adminPublishConfig.skipReason ?? undefined);

    test("admin can publish content and verify it on public surfaces", async ({ page }) => {
        test.slow();

        /*
         * This spec is intentionally env-gated because it mutates real content using
         * real admin credentials. It supports two media modes:
         * 1. Default: fill the supported direct image URL field, which is the safest
         *    cross-environment path when storage credentials/buckets are not available.
         * 2. Opt-in upload: set E2E_ADMIN_EXERCISE_UPLOAD=1 to hit /api/admin/upload
         *    with a generated PNG fixture and verify the storage-backed path too.
         */

        const uniqueToken = `pw-${Date.now()}`;
        const title = `Playwright Admin Publish ${uniqueToken}`;
        const author = "Codex QA";
        const segmentTitle = `Segment ${uniqueToken}`;
        const segmentBody = [
            "This production-grade E2E entry validates the admin publish path.",
            "It exists to verify browse, preview, read, and search after publishing.",
            "The body includes enough words to trigger duration estimation reliably.",
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

        if (adminPublishConfig.exerciseUpload) {
            const uploadFixture = await createImageUploadFixture();

            try {
                await page
                    .locator('label:has-text("Click to upload cover image") input[type="file"]')
                    .setInputFiles(uploadFixture.filePath);

                await expect(
                    page.getByPlaceholder("Or paste image URL directly...")
                ).not.toHaveValue("", { timeout: 20_000 });
            } finally {
                await uploadFixture.cleanup();
            }
        } else {
            await page
                .getByPlaceholder("Or paste image URL directly...")
                .fill(adminPublishConfig.coverImageUrl);
        }

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
        await expect(row.getByText("Published", { exact: true })).toBeVisible();

        const editLink = row.locator('a[title="Edit"]');
        await expect(editLink).toBeVisible();

        const editHref = await editLink.getAttribute("href");
        expect(editHref).toBeTruthy();

        const contentIdMatch = editHref?.match(/\/admin\/content\/([^/]+)\/edit$/);
        expect(contentIdMatch?.[1]).toBeTruthy();
        const contentId = contentIdMatch![1];

        await page.addInitScript(
            ({ storageKey, onboardingState }) => {
                window.localStorage.setItem(storageKey, JSON.stringify(onboardingState));
            },
            {
                storageKey: GUEST_ONBOARDING_STORAGE_KEY,
                onboardingState: createGuestOnboardingEntry("completed"),
            }
        );

        await page.goto("/browse");
        const browseLink = page.getByRole("link", {
            name: new RegExp(`^Preview ${escapeRegExp(title)}$`),
        });
        await expect(browseLink).toBeVisible({ timeout: 20_000 });
        await browseLink.click();

        await page.waitForURL(new RegExp(`/preview/${escapeRegExp(contentId)}$`), {
            timeout: 20_000,
        });
        await expect(page.getByRole("heading", { name: title })).toBeVisible();
        await expect(page.getByText(author, { exact: true })).toBeVisible();

        await page.getByRole("link", { name: "Read" }).click();
        await page.waitForURL(new RegExp(`/read/${escapeRegExp(contentId)}(?:/|$)`), {
            timeout: 20_000,
        });
        await expect(page.locator("main").first()).toBeVisible();
        await expect(page.getByText(segmentTitle, { exact: true })).toBeVisible();

        await page.goto(`/search?q=${encodeURIComponent(uniqueToken)}`);
        await expect(page.getByText(title, { exact: true })).toBeVisible({
            timeout: 20_000,
        });
        await expect(
            page.getByRole("link", {
                name: new RegExp(`^Preview ${escapeRegExp(title)}$`),
            })
        ).toBeVisible();
    });
});
