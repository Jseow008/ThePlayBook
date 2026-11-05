import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
const mocks = vi.hoisted(() => ({ admin: vi.fn(), rpc: vi.fn(), from: vi.fn(), rate: vi.fn() }));
vi.mock("@/lib/admin/auth", () => ({ verifyAdminSession: mocks.admin }));
vi.mock("@/lib/supabase/admin", () => ({ getAdminClient: () => ({ rpc: mocks.rpc, from: mocks.from }) }));
vi.mock("@/lib/server/rate-limit", () => ({ rateLimit: mocks.rate }));
vi.mock("@/lib/server/api", async original => ({ ...await original<typeof import("@/lib/server/api")>(), logApiError: vi.fn() }));
import { GET, POST } from "@/app/api/admin/content/[id]/version/route";
const id = "11111111-1111-4111-8111-111111111111";
const draft = "22222222-2222-4222-8222-222222222222";
const stamp = "2026-11-05T00:00:00+00:00";
const context = { params: Promise.resolve({ id }) };
const request = (body: unknown = { sourceUpdatedAt: stamp }) => new NextRequest(`http://localhost/api/admin/content/${id}/version`, { method: "POST", body: JSON.stringify(body) });
describe("updated version API", () => {
    beforeEach(() => {
        vi.clearAllMocks(); mocks.admin.mockResolvedValue(true); mocks.rate.mockResolvedValue({ success: true });
        mocks.rpc.mockResolvedValue({ data: draft, error: null });
    });
    it("rejects non-admins and rate limits before reading or writing content", async () => {
        mocks.admin.mockResolvedValue(false);
        expect((await POST(request(),context)).status).toBe(401);
        expect((await GET(new NextRequest("http://localhost"),context)).status).toBe(401);
        mocks.admin.mockResolvedValue(true); mocks.rate.mockResolvedValue({ success: false });
        expect((await POST(request(),context)).status).toBe(429);
        expect(mocks.rpc).not.toHaveBeenCalled(); expect(mocks.from).not.toHaveBeenCalled();
    });
    it("creates/resumes only through the atomic copy operation with the reviewed timestamp", async () => {
        const response = await POST(request(),context);
        expect(await response.json()).toEqual({ success: true, draftId: draft });
        expect(mocks.rpc).toHaveBeenCalledExactlyOnceWith("admin_create_content_version",{ p_source_id: id, p_source_updated_at: stamp });
    });
    it("requires a source timestamp and refuses arbitrary copied data", async () => {
        expect((await POST(request({}),context)).status).toBe(400);
        expect((await POST(request({sourceUpdatedAt: stamp, segments: []}),context)).status).toBe(400);
        expect(mocks.rpc).not.toHaveBeenCalled();
    });
    it("reports conflicts and failure without claiming a draft exists", async () => {
        for (const [code,status] of [["40001",409],["22023",400],["P0002",404],["XX000",500]] as const) {
            mocks.rpc.mockResolvedValue({data: null,error: { code }});
            expect((await POST(request(),context)).status).toBe(status);
        }
    });
    it("reviews the linked original with persisted timestamps and preservation counts", async () => {
        let itemCalls = 0;
        mocks.from.mockImplementation(table => ({select: () => ({eq: () => table === "content_item" ? {single: () => Promise.resolve({data: ++itemCalls === 1 ? {
            id:draft,title:"New",status:"draft",update_source_id:id,deleted_at:null,updated_at:stamp,
        } : {id,title:"Old",status:"verified",deleted_at:null,updated_at:stamp},error:null})} : Promise.resolve({count:3,error:null})})}));
        const response = await GET(new NextRequest("http://localhost"),context);
        expect(response.status).toBe(200);
        expect(await response.json()).toMatchObject({source:{id,updated_at:stamp},replacement:{id:draft},preserved:{highlights:3}});
    });
});
