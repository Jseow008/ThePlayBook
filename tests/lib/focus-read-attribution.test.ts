import { beforeEach, describe, expect, it, vi } from "vitest";
import { consumeConfirmedFocusRead, markFocusReadIntent } from "@/lib/focus-read-attribution";

const context = {
    focus_visit_id: "visit-1",
    content_id: "123e4567-e89b-12d3-a456-426614174222",
    variant: "ranked" as const,
    entry_kind: "fresh" as const,
    selection_source: "personalized" as const,
    personalization_ready: true,
    device_class: "mobile" as const,
    position: 1,
};

describe("Focus read attribution", () => {
    beforeEach(() => window.sessionStorage.clear());

    it("attributes an actual reader render once", () => {
        markFocusReadIntent(context);
        expect(consumeConfirmedFocusRead(context.content_id)).toEqual(context);
        expect(consumeConfirmedFocusRead(context.content_id)).toBeNull();
    });

    it("drops an old or unrelated intent", () => {
        const now = vi.spyOn(Date, "now").mockReturnValueOnce(0).mockReturnValue(31_000);
        markFocusReadIntent(context);
        expect(consumeConfirmedFocusRead(context.content_id)).toBeNull();
        now.mockRestore();

        markFocusReadIntent(context);
        expect(consumeConfirmedFocusRead("another-item")).toBeNull();
    });
});
