import { NextRequest } from "next/server";
import { beforeEach, expect, it, vi } from "vitest";
import { POST } from "@/app/api/content-requests/route";

const { submit, existing, outbound } = vi.hoisted(() => ({
    submit: vi.fn(), existing: { id: null as string | null }, outbound: vi.fn(),
}));
vi.mock("@/lib/server/rate-limit", () => ({ rateLimit: async () => ({ success: true }) }));
vi.mock("@/lib/supabase/server", () => ({
    createClient: async () => ({ auth: { getUser: async () => ({ data: { user: { id: "account-a" } } }) } }),
}));
vi.mock("@/lib/supabase/admin", () => ({
    getAdminClient: () => ({
        from: () => {
            const query = {
                select: () => query, is: () => query, order: () => query, limit: () => query, eq: () => query,
                maybeSingle: async () => ({ data: existing.id ? { id: existing.id } : null, error: null }),
                gte: async () => ({ count: 0, error: null }),
            };
            return query;
        },
        rpc: submit,
    }),
}));
vi.mock("@/lib/server/content-requests", () => ({
    fetchContentRequestById: async () => ({
        id: "existing-id", title: "Another account's title", source_url: "https://private.test", thumbnail_url: null,
    }),
}));
beforeEach(() => {
    vi.clearAllMocks();
    existing.id = null;
    vi.stubGlobal("fetch", outbound);
    submit.mockReturnValue({ single: async () => ({
        data: { request_id: "existing-id", duplicate: false, voted: true }, error: null,
    }) });
});
function request(input: string, content_type = "book") {
    return new NextRequest("https://example.test/api/content-requests", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ input, content_type, author: "Synthetic creator" }),
    });
}
it.each(["book", "podcast", "article", "video"])("saves a URL with selected %s format without external enrichment", async format => {
    const response = await POST(request("https://example.test/source?utm_source=test", format));
    expect(response.status).toBe(201);
    expect(submit).toHaveBeenCalledWith("submit_content_request", expect.objectContaining({
        p_source_url: "https://example.test/source",
        p_title: "https://example.test/source?utm_source=test",
        p_content_type: format, p_thumbnail_url: null, p_user_id: "account-a",
    }));
    expect(outbound).not.toHaveBeenCalled();
});
it("acknowledges a duplicate using only submitted text and preserves interest", async () => {
    existing.id = "existing-id";
    submit.mockReturnValue({ single: async () => ({
        data: { request_id: "existing-id", duplicate: true, voted: true }, error: null,
    }) });
    const response = await POST(request("Synthetic title by Synthetic author"));
    expect(response.status).toBe(200);
    expect((await response.json()).data).toEqual({
        request: { title: "Synthetic title" }, duplicate: true, voted: true,
    });
    expect(submit).toHaveBeenCalledOnce();
});
it("returns a recoverable failure when persistence fails", async () => {
    submit.mockReturnValue({ single: async () => ({ data: null, error: new Error("controlled failure") }) });
    expect((await POST(request("Synthetic title"))).status).toBe(500);
    expect(outbound).not.toHaveBeenCalled();
});
