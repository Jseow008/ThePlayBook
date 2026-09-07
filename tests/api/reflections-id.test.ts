import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { DELETE, PATCH } from "@/app/api/library/reflections/[id]/route";
import { createClient } from "@/lib/supabase/server";
import { rateLimit } from "@/lib/server/rate-limit";

vi.mock("@/lib/supabase/server", () => ({
    createClient: vi.fn(),
}));

vi.mock("@/lib/server/rate-limit", () => ({
    rateLimit: vi.fn(),
}));

describe("Reflection detail API", () => {
    const reflectionId = "123e4567-e89b-12d3-a456-426614174000";
    const mockGetUser = vi.fn();
    const mockMaybeSingle = vi.fn();
    const mockUpdate = vi.fn(() => ({
        eq: vi.fn().mockReturnThis(),
        select: vi.fn().mockReturnThis(),
        maybeSingle: mockMaybeSingle,
    }));
    const mockDeleteResult = vi.fn();
    const mockDelete = vi.fn(() => ({
        eq: vi.fn().mockReturnThis(),
        then: mockDeleteResult,
    }));
    const mockFrom = vi.fn(() => ({
        update: mockUpdate,
        delete: mockDelete,
    }));

    beforeEach(() => {
        vi.clearAllMocks();
        (createClient as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
            auth: { getUser: mockGetUser },
            from: mockFrom,
        });
        (rateLimit as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({ success: true });
        mockGetUser.mockResolvedValue({ data: { user: { id: "user-1" } } });
        mockMaybeSingle.mockResolvedValue({
            data: {
                id: reflectionId,
                content_item_id: "content-1",
                reflection_text: "Updated reflection",
                updated_at: "2026-09-07T12:00:00.000Z",
            },
            error: null,
        });
        mockDeleteResult.mockImplementation((resolve: (value: unknown) => void) => resolve({ error: null, count: 1 }));
    });

    it("updates only the authenticated user's reflection", async () => {
        const response = await PATCH(
            new NextRequest(`http://localhost/api/library/reflections/${reflectionId}`, {
                method: "PATCH",
                body: JSON.stringify({ reflection_text: "Updated reflection" }),
            }),
            { params: Promise.resolve({ id: reflectionId }) }
        );

        expect(response.status).toBe(200);
        expect(mockUpdate).toHaveBeenCalledWith(expect.objectContaining({ reflection_text: "Updated reflection" }));
    });

    it("deletes only the authenticated user's reflection", async () => {
        const response = await DELETE(
            new NextRequest(`http://localhost/api/library/reflections/${reflectionId}`, { method: "DELETE" }),
            { params: Promise.resolve({ id: reflectionId }) }
        );

        expect(response.status).toBe(200);
        expect(await response.json()).toEqual({ success: true });
    });
});
