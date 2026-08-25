import { describe, expect, it, vi } from "vitest";
import { buildWelcomePath, resolvePostAuthDestination } from "@/lib/auth-activation";
import { APP_ONBOARDING_TOUR_KEY, APP_ONBOARDING_VERSION } from "@/lib/onboarding";

function createProfileClient(onboardingState: unknown, error: unknown = null) {
    const maybeSingle = vi.fn().mockResolvedValue({ data: onboardingState === undefined ? null : { onboarding_state: onboardingState }, error });
    const eq = vi.fn(() => ({ maybeSingle }));
    const select = vi.fn(() => ({ eq }));
    const from = vi.fn(() => ({ select }));

    return { client: { from }, from, select, eq, maybeSingle };
}

describe("post-auth activation routing", () => {
    it("sends an account without completed activation to welcome", async () => {
        const { client } = createProfileClient({});

        await expect(resolvePostAuthDestination(client as never, { id: "user-1" }, "/notes?ask=1"))
            .resolves.toBe("/welcome?next=%2Fnotes%3Fask%3D1");
    });

    it("preserves the requested destination once activation is completed", async () => {
        const { client } = createProfileClient({
            [APP_ONBOARDING_TOUR_KEY]: {
                version: APP_ONBOARDING_VERSION,
                status: "completed",
                updated_at: "2026-08-25T00:00:00.000Z",
            },
        });

        await expect(resolvePostAuthDestination(client as never, { id: "user-1" }, "/notes?ask=1"))
            .resolves.toBe("/notes?ask=1");
    });

    it("falls back to the safe destination when activation state cannot be read", async () => {
        const { client } = createProfileClient(undefined, new Error("Database unavailable"));

        await expect(resolvePostAuthDestination(client as never, { id: "user-1" }, "https://evil.example"))
            .resolves.toBe("/browse");
    });

    it("encodes the return location for the welcome route", () => {
        expect(buildWelcomePath("/notes?ask=1")).toBe("/welcome?next=%2Fnotes%3Fask%3D1");
    });
});
