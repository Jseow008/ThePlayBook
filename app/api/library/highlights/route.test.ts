import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { DELETE } from "@/app/api/library/highlights/route";
import { createClient } from "@/lib/supabase/server";
import { rateLimit } from "@/lib/server/rate-limit";

vi.mock("@/lib/supabase/server", () => ({
    createClient: vi.fn(),
}));

vi.mock("@/lib/server/rate-limit", () => ({
    rateLimit: vi.fn(),
}));

describe("DELETE /api/library/highlights", () => {
    const mockGetUser = vi.fn();
    const mockCountByUser = vi.fn();
    const mockDeleteByUser = vi.fn();
    const mockSelect = vi.fn(() => ({ eq: mockCountByUser }));
    const mockDelete = vi.fn(() => ({ eq: mockDeleteByUser }));
    const mockFrom = vi.fn(() => ({ select: mockSelect, delete: mockDelete }));

    beforeEach(() => {
        vi.clearAllMocks();
        (createClient as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
            auth: { getUser: mockGetUser },
            from: mockFrom,
        });
        (rateLimit as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({ success: true });
        mockGetUser.mockResolvedValue({ data: { user: { id: "user-123" } } });
        mockCountByUser.mockResolvedValue({ count: 2, error: null });
        mockDeleteByUser.mockResolvedValue({ error: null });
    });

    it("requires authentication", async () => {
        mockGetUser.mockResolvedValueOnce({ data: { user: null } });

        const response = await DELETE(new NextRequest("http://localhost/api/library/highlights", { method: "DELETE" }));

        expect(response.status).toBe(401);
        expect(mockFrom).not.toHaveBeenCalled();
    });

    it("deletes only the authenticated user's notes and highlights", async () => {
        const response = await DELETE(new NextRequest("http://localhost/api/library/highlights", { method: "DELETE" }));

        expect(response.status).toBe(200);
        await expect(response.json()).resolves.toEqual({ success: true, deletedCount: 2 });
        expect(mockFrom).toHaveBeenCalledWith("user_highlights");
        expect(mockCountByUser).toHaveBeenCalledWith("user_id", "user-123");
        expect(mockDeleteByUser).toHaveBeenCalledWith("user_id", "user-123");
    });

    it("does not delete records when counting fails", async () => {
        mockCountByUser.mockResolvedValueOnce({ count: null, error: new Error("Database unavailable") });

        const response = await DELETE(new NextRequest("http://localhost/api/library/highlights", { method: "DELETE" }));

        expect(response.status).toBe(500);
        expect(mockDelete).not.toHaveBeenCalled();
    });
});
