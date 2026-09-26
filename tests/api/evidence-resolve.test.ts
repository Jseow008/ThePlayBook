import { NextRequest } from "next/server";
import { beforeEach, expect, it, vi } from "vitest";
import { POST } from "@/app/api/evidence/resolve/route";
import { createClient } from "@/lib/supabase/server";
import { resolveEvidenceCitation } from "@/lib/server/evidence-citation";
import { assertActiveChatSession, ChatSessionValidationError } from "@/lib/server/personal-retrieval-session";
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));
vi.mock("@/lib/server/evidence-citation", () => ({ resolveEvidenceCitation: vi.fn() }));
vi.mock("@/lib/server/rate-limit", () => ({ rateLimit: vi.fn(async () => ({ success: true })) }));
vi.mock("@/lib/server/personal-retrieval-session", async (original) => ({ ...await original<typeof import("@/lib/server/personal-retrieval-session")>(), assertActiveChatSession: vi.fn() }));
const getUser = vi.fn();
const request = (body = JSON.stringify({ token: "opaque" })) => new NextRequest("http://localhost/api/evidence/resolve", { method: "POST", body });
beforeEach(() => {
    vi.resetAllMocks();
    getUser.mockResolvedValue({ data: { user: { id: "account" } }, error: null });
    vi.mocked(createClient).mockResolvedValue({ auth: { getUser } } as unknown as Awaited<ReturnType<typeof createClient>>);
    vi.mocked(resolveEvidenceCitation).mockResolvedValue({ state: "available", passages: [{ label: "Note", text: "private", before: "", after: "" }] });
});
it("checks authentication at entry and before delivery, with private no-store responses", async () => {
    const response = await POST(request());
    expect(response.status).toBe(200); expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(assertActiveChatSession).toHaveBeenCalledTimes(2); expect(getUser).toHaveBeenCalledTimes(2);
    expect(await response.json()).toMatchObject({ state: "available" });
});
it("returns no excerpt on logout or account change while resolving", async () => {
    getUser.mockResolvedValueOnce({ data: { user: { id: "account" } }, error: null }).mockResolvedValueOnce({ data: { user: { id: "different" } }, error: null });
    const response = await POST(request()); expect(response.status).toBe(401); expect(await response.text()).not.toContain("private");
});
it("rejects revoked sessions and never resolves their references", async () => {
    vi.mocked(assertActiveChatSession).mockRejectedValueOnce(new ChatSessionValidationError("UNAUTHORIZED"));
    expect((await POST(request())).status).toBe(401); expect(resolveEvidenceCitation).not.toHaveBeenCalled();
});
it("distinguishes operational failure from unavailable evidence", async () => {
    vi.mocked(resolveEvidenceCitation).mockRejectedValueOnce(new Error("temporary database outage"));
    const failed = await POST(request()); expect(failed.status).toBe(503); expect(await failed.text()).not.toContain("database");
    vi.mocked(resolveEvidenceCitation).mockResolvedValueOnce({ state: "unavailable" });
    const missing = await POST(request()); expect(missing.status).toBe(200); expect(await missing.json()).toEqual({ state: "unavailable" });
});
it("bounds input even without Content-Length and rejects malformed JSON", async () => {
    expect((await POST(request("x".repeat(24_001)))).status).toBe(413);
    expect(await (await POST(request("invalid"))).json()).toEqual({ state: "unavailable" });
    expect(resolveEvidenceCitation).not.toHaveBeenCalled();
});
