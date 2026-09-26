import { POST, DELETE } from '@/app/api/library/bookmarks/route';
import { NextRequest } from 'next/server';
import { vi } from 'vitest';
import { createClient } from '@/lib/supabase/server';
import { rateLimit } from '@/lib/server/rate-limit';
import * as repo from '@/lib/server/user-library-repository';

vi.mock('@/lib/supabase/server', () => ({
    createClient: vi.fn(),
}));

vi.mock('@/lib/server/rate-limit', () => ({
    rateLimit: vi.fn(),
}));

vi.mock('@/lib/server/user-library-repository', () => ({
    upsertUserLibrary: vi.fn(),
    getUserLibraryRow: vi.fn(),
    updateUserLibrary: vi.fn(),
    deleteUserLibrary: vi.fn(),
}));

describe('Bookmarks API', () => {
    const mockUser = { id: 'user-123' };
    const mockAuthUser = vi.fn();
    const mockSupabaseClient = {
        auth: { getUser: mockAuthUser }
    };

    beforeEach(() => {
        vi.clearAllMocks();
        (createClient as any).mockResolvedValue(mockSupabaseClient);
        (rateLimit as any).mockResolvedValue({ success: true, retryAfterMs: 0 });
        mockAuthUser.mockResolvedValue({ data: { user: mockUser } });
    });

    for (const [method, handler] of [["POST", POST], ["DELETE", DELETE]] as const) {
        describe(method, () => {
            const request = () => new NextRequest("http://localhost/api/library/bookmarks", {
                method, body: JSON.stringify({ content_item_id: "123e4567-e89b-12d3-a456-426614174000" }),
            });
            it("requires authentication", async () => {
                mockAuthUser.mockResolvedValueOnce({ data: { user: null } });
                expect((await handler(request())).status).toBe(401);
            });
            it("retains the rate limit", async () => {
                vi.mocked(rateLimit).mockResolvedValueOnce({ success: false, retryAfterMs: 20_000 });
                const response = await handler(request());
                expect(response.status).toBe(429);
                expect(response.headers.get("Retry-After")).toBe("20");
                expect(mockAuthUser).not.toHaveBeenCalled();
            });
            it("requires refresh and never reads or writes a library row", async () => {
                const response = await handler(request());
                expect(response.status).toBe(428);
                expect(await response.json()).toMatchObject({ error: { code: "LIBRARY_REFRESH_REQUIRED" } });
                for (const operation of Object.values(repo)) expect(operation).not.toHaveBeenCalled();
            });
        });
    }
});
