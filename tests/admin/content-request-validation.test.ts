import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { updateContentRequest } from "@/app/admin/requests/actions";
import { verifyAdminSession } from "@/lib/admin/auth";
import { getAdminClient } from "@/lib/supabase/admin";

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
    update.mockReturnValue({ eq: vi.fn(async () => ({ error: null })) });
    vi.mocked(getAdminClient).mockReturnValue({ from: vi.fn(() => ({ update,
        select: vi.fn(() => ({ eq: vi.fn(() => ({ single: vi.fn(async () => ({ data: {
            id: legacyId, status: "pending", published_content_id: null }, error: null })) })) })) })) } as unknown as ReturnType<typeof getAdminClient>);
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
