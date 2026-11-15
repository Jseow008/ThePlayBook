import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { updateContentRequest } from "@/app/admin/requests/actions";
import { verifyAdminSession } from "@/lib/admin/auth";
import { getAdminClient } from "@/lib/supabase/admin";
import { after } from "next/server";
import { queueContentRequestPublishedNotifications, processQueuedContentRequestNotifications } from "@/lib/server/content-request-notifications";

vi.mock("@/lib/admin/auth", () => ({ verifyAdminSession: vi.fn() }));
vi.mock("@/lib/supabase/admin", () => ({ getAdminClient: vi.fn() }));
vi.mock("@/lib/server/api", () => ({ getRequestId: () => "synthetic-request", logApiError: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/server", async (original) => ({ ...await original<typeof import("next/server")>(), after: vi.fn() }));
vi.mock("@/lib/server/content-request-notifications", () => ({ CONTENT_REQUEST_NOTIFICATION_BATCH_SIZE: 1,
    queueContentRequestPublishedNotifications: vi.fn(async () => 0), processQueuedContentRequestNotifications: vi.fn() }));

const previous = { status: "idle" as const, message: null };
const legacyId = "11111111-1111-1111-1111-111111111111";
function form(values: Record<string, string>) {
    const data = new FormData();
    for (const [key, value] of Object.entries({ requestId: legacyId, ...values })) data.set(key, value);
    return data;
}
const update = vi.fn();
beforeEach(() => {
    vi.clearAllMocks(); vi.mocked(verifyAdminSession).mockResolvedValue(true);
    vi.mocked(queueContentRequestPublishedNotifications).mockResolvedValue(0);
    update.mockReturnValue({ eq: vi.fn(async () => ({ error: null })) });
    vi.mocked(getAdminClient).mockReturnValue({ from: vi.fn(() => ({ update,
        select: vi.fn(() => ({ eq: vi.fn(() => ({ single: vi.fn(async () => ({ data: {
            id: legacyId, status: "pending", published_content_id: null }, error: null })) })) })) })) } as unknown as ReturnType<typeof getAdminClient>);
});

describe("published notification recovery", () => {
    it("warns honestly after failure, retries the published request, and clears the warning after success", async () => {
        let persistedStatus = "pending";
        vi.mocked(getAdminClient).mockReturnValue({ from: vi.fn(() => ({
            select: vi.fn(() => ({ eq: vi.fn(() => ({ single: vi.fn(async () => ({
                data: { id: legacyId, status: persistedStatus }, error: null,
            })) })) })),
            update: vi.fn((payload: { status: string }) => ({ eq: vi.fn(async () => {
                persistedStatus = payload.status;
                return { error: null };
            }) })),
        })) } as unknown as ReturnType<typeof getAdminClient>);
        vi.mocked(queueContentRequestPublishedNotifications).mockRejectedValueOnce(new Error("synthetic enqueue failure"));
        const input = { status: "published", publishedContentId: "synthetic-content" };
        const failed = await updateContentRequest(previous, form(input));
        expect(failed.status).toBe("success");
        expect(failed.notificationWarning).toContain("Save changes again to retry");
        expect(persistedStatus).toBe("published");
        expect(after).not.toHaveBeenCalled();

        vi.mocked(queueContentRequestPublishedNotifications).mockResolvedValueOnce(2);
        const recovered = await updateContentRequest(failed, form(input));
        expect(recovered).toEqual({ status: "success", message: "Request saved." });
        expect(queueContentRequestPublishedNotifications).toHaveBeenCalledTimes(2);
        expect(queueContentRequestPublishedNotifications).toHaveBeenLastCalledWith(legacyId);
        expect(after).toHaveBeenCalledTimes(1);
        const background = vi.mocked(after).mock.calls[0][0];
        if (typeof background === "function") await background();
        expect(processQueuedContentRequestNotifications).toHaveBeenCalledTimes(1);

        await updateContentRequest(recovered, form(input));
        expect(after).toHaveBeenCalledTimes(1); // zero newly queued rows: no new send
    });

    it("retains the warning after repeated failure and never queues non-published requests", async () => {
        vi.mocked(queueContentRequestPublishedNotifications).mockRejectedValue(new Error("synthetic unavailable database"));
        const input = { status: "published", publishedContentId: "synthetic-content" };
        const first = await updateContentRequest(previous, form(input));
        expect((await updateContentRequest(first, form(input))).notificationWarning).toBe(first.notificationWarning);
        expect(queueContentRequestPublishedNotifications).toHaveBeenCalledTimes(2);
        await updateContentRequest(previous, form({ status: "pending" }));
        expect(queueContentRequestPublishedNotifications).toHaveBeenCalledTimes(2);
        expect(after).not.toHaveBeenCalled();
    });
});
afterEach(() => vi.restoreAllMocks());

describe("admin request validation after the Zod migration", () => {
    it("rejects unauthorized actions before reading or mutating data", async () => {
        vi.mocked(verifyAdminSession).mockResolvedValue(false);
        expect((await updateContentRequest(previous, form({ status: "published" }))).status).toBe("error");
        expect(getAdminClient).not.toHaveBeenCalled();
    });
    it.each(["skipped", "failed"])("requires an admin reason for %s", async (status) => {
        const result = await updateContentRequest(previous, form({ status, adminNote: "  " }));
        expect(result.fieldErrors?.adminNote).toBe("Skipped and failed requests require an admin reason.");
        expect(getAdminClient).not.toHaveBeenCalled();
    });
    it("requires a content link for publication and retains field-specific errors", async () => {
        const result = await updateContentRequest(previous, form({ status: "published", publishedContentId: " " }));
        expect(result.fieldErrors?.publishedContentId).toBe("Published requests must be linked to content.");
        expect(getAdminClient).not.toHaveBeenCalled();
    });
    it("rejects unknown status and excessive hidden reason without writes", async () => {
        const result = await updateContentRequest(previous, form({ status: "invented", hiddenReason: "x".repeat(501) }));
        expect(result.fieldErrors?.status).toBeTruthy(); expect(result.fieldErrors?.hiddenReason).toBeTruthy();
        expect(getAdminClient).not.toHaveBeenCalled();
    });
    it("preserves generic UUIDs, trimming and the default visible state", async () => {
        const result = await updateContentRequest(previous, form({ status: "published", publishedContentId: "  synthetic-content  ", adminNote: "  approved  " }));
        expect(result.status).toBe("success");
        expect(update).toHaveBeenCalledWith({ status: "published", published_content_id: "synthetic-content", admin_note: "approved", hidden_at: null, hidden_reason: null });
    });
    it("preserves explicit hide/unhide behavior", async () => {
        const result = await updateContentRequest(previous, form({ status: "pending", hideRequest: "true", hiddenReason: "  duplicate  " }));
        expect(result.status).toBe("success");
        expect(update).toHaveBeenCalledWith(expect.objectContaining({ hidden_at: expect.any(String), hidden_reason: "duplicate" }));
    });
});
