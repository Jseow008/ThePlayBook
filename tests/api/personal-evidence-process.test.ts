import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
const processIndex = vi.hoisted(() => vi.fn());
vi.mock("@/lib/server/personal-evidence-indexer", () => ({ processPersonalEvidenceIndex: processIndex }));
import { GET } from "@/app/api/admin/personal-evidence/process/route";
beforeEach(() => { vi.stubEnv("CRON_SECRET", "test-secret"); processIndex.mockReset(); });
afterEach(() => vi.unstubAllEnvs());
const request = () => new NextRequest("http://localhost/api/admin/personal-evidence/process", { headers: { authorization: "Bearer test-secret" } });
describe("personal evidence cron response", () => {
    it("reports provider deferral as unavailable and preserves backoff", async () => {
        processIndex.mockResolvedValue({ completed: 0, deferred: 2, failed: 0, retryAfterSeconds: 900 });
        const response = await GET(request());
        expect(response.status).toBe(503);
        expect(response.headers.get("Retry-After")).toBe("900");
        expect((await response.json()).success).toBe(false);
    });
    it("returns only a generic error on database/provider exceptions", async () => {
        processIndex.mockRejectedValue(new Error("private note content"));
        const response = await GET(request());
        expect(response.status).toBe(503);
        expect(await response.text()).not.toContain("private note content");
    });
    it("reports actual completion counts and forwards cancellation", async () => {
        processIndex.mockResolvedValue({ completed: 2, deferred: 0, failed: 0, retryAfterSeconds: 0 });
        const req = request();
        const response = await GET(req);
        expect(response.status).toBe(200);
        expect(processIndex).toHaveBeenCalledWith({ signal: req.signal });
        expect(response.headers.get("Cache-Control")).toBe("no-store");
    });
});
