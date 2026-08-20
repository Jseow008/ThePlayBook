import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { GET, POST } from "@/app/api/admin/story-images/process/route";
import { verifyAdminSession } from "@/lib/admin/auth";
import { rateLimit } from "@/lib/server/rate-limit";
import {
    expireStaleStoryImageJobs,
    getStoryImageQueueSummary,
    processStoryImageJobs,
} from "@/lib/server/story-image-processor";

vi.mock("@/lib/admin/auth", () => ({ verifyAdminSession: vi.fn() }));
vi.mock("@/lib/server/rate-limit", () => ({ rateLimit: vi.fn() }));
vi.mock("@/lib/server/story-image-processor", () => ({
    STORY_IMAGE_PROCESS_BATCH_SIZE: 1,
    expireStaleStoryImageJobs: vi.fn(),
    getStoryImageQueueSummary: vi.fn(),
    processStoryImageJobs: vi.fn(),
}));

describe("story image worker route", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        vi.stubEnv("CRON_SECRET", "test-cron-secret");
        vi.mocked(rateLimit).mockResolvedValue({ success: true } as never);
        vi.mocked(verifyAdminSession).mockResolvedValue(true);
        vi.mocked(expireStaleStoryImageJobs).mockResolvedValue({ expiredCount: 0 });
        vi.mocked(getStoryImageQueueSummary).mockResolvedValue({
            pendingCount: 1,
            processingCount: 0,
            failedCount: 0,
        });
        vi.mocked(processStoryImageJobs).mockResolvedValue({
            processed: true,
            processedCount: 1,
            results: [],
        });
    });

    it("requires the cron secret for scheduled GET requests", async () => {
        const response = await GET(new NextRequest("http://localhost/api/admin/story-images/process"));

        expect(response.status).toBe(401);
        expect(processStoryImageJobs).not.toHaveBeenCalled();
    });

    it("processes a scheduled attempt with the cron secret", async () => {
        const response = await GET(new NextRequest("http://localhost/api/admin/story-images/process", {
            headers: { authorization: "Bearer test-cron-secret" },
        }));

        expect(response.status).toBe(200);
        expect(expireStaleStoryImageJobs).toHaveBeenCalledTimes(1);
        expect(processStoryImageJobs).toHaveBeenCalledTimes(1);
    });

    it("allows an authenticated admin to invoke recovery", async () => {
        const response = await POST(new NextRequest("http://localhost/api/admin/story-images/process", {
            method: "POST",
        }));

        expect(response.status).toBe(200);
        expect(verifyAdminSession).toHaveBeenCalledTimes(1);
        expect(processStoryImageJobs).toHaveBeenCalledTimes(1);
    });
});
