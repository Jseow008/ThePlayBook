import { afterEach, describe, expect, it, vi } from "vitest";
import { isAutomaticNarrationOnPublishEnabled } from "@/lib/server/narration-policy";

describe("automatic narration publish policy", () => {
    afterEach(() => {
        vi.unstubAllEnvs();
    });

    it("is disabled unless explicitly enabled", () => {
        expect(isAutomaticNarrationOnPublishEnabled()).toBe(false);

        vi.stubEnv("AUTO_GENERATE_NARRATION_ON_PUBLISH", "false");
        expect(isAutomaticNarrationOnPublishEnabled()).toBe(false);

        vi.stubEnv("AUTO_GENERATE_NARRATION_ON_PUBLISH", "true");
        expect(isAutomaticNarrationOnPublishEnabled()).toBe(true);
    });
});
