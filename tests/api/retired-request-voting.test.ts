import { expect, it } from "vitest";
import { POST, DELETE } from "@/app/api/content-requests/[id]/vote/route";

it.each([POST, DELETE])("retires board voting without returning another request", async handler => {
    const response = handler();
    expect(response.status).toBe(410);
    expect(await response.json()).toEqual({
        error: { code: "REQUEST_VOTING_RETIRED", message: "Submit a summary request to register your interest." },
    });
});
