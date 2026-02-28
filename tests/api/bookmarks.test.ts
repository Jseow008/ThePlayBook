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

    describe('POST /', () => {
        it('requires authentication', async () => {
            mockAuthUser.mockResolvedValueOnce({ data: { user: null } });
            const req = new NextRequest(new URL('http://localhost/api/library/bookmarks'), {
                method: 'POST',
                body: JSON.stringify({ content_item_id: '123e4567-e89b-12d3-a456-426614174000' })
            });
            const res = await POST(req);
            expect(res.status).toBe(401);
        });

        it('validates payload schema', async () => {
            const req = new NextRequest(new URL('http://localhost/api/library/bookmarks'), {
                method: 'POST',
                body: JSON.stringify({ invalid_id: 123 })
            });
            const res = await POST(req);
            expect(res.status).toBe(400);
        });

        it('saves a bookmark', async () => {
            (repo.upsertUserLibrary as any).mockResolvedValue({ error: null });

            const req = new NextRequest(new URL('http://localhost/api/library/bookmarks'), {
                method: 'POST',
                body: JSON.stringify({ content_item_id: '123e4567-e89b-12d3-a456-426614174000' })
            });
            const res = await POST(req);
            expect(res.status).toBe(200);

            expect(repo.upsertUserLibrary).toHaveBeenCalledWith(mockSupabaseClient, expect.objectContaining({
                user_id: 'user-123',
                content_id: '123e4567-e89b-12d3-a456-426614174000',
                is_bookmarked: true,
            }));
        });
    });

    describe('DELETE /', () => {
        it('deletes a bookmark completely if no reading progress', async () => {
            (repo.getUserLibraryRow as any).mockResolvedValue({ data: { progress: null }, error: null });
            (repo.deleteUserLibrary as any).mockResolvedValue({ error: null });

            const req = new NextRequest(new URL('http://localhost/api/library/bookmarks'), {
                method: 'DELETE',
                body: JSON.stringify({ content_item_id: '123e4567-e89b-12d3-a456-426614174000' })
            });
            const res = await DELETE(req);
            expect(res.status).toBe(200);
            expect(repo.deleteUserLibrary).toHaveBeenCalledWith(mockSupabaseClient, 'user-123', '123e4567-e89b-12d3-a456-426614174000');
        });

        it('updates bookmark status to false if there is reading progress', async () => {
            (repo.getUserLibraryRow as any).mockResolvedValue({ data: { progress: 50 }, error: null });
            (repo.updateUserLibrary as any).mockResolvedValue({ error: null });

            const req = new NextRequest(new URL('http://localhost/api/library/bookmarks'), {
                method: 'DELETE',
                body: JSON.stringify({ content_item_id: '123e4567-e89b-12d3-a456-426614174000' })
            });
            const res = await DELETE(req);
            expect(res.status).toBe(200);
            expect(repo.updateUserLibrary).toHaveBeenCalledWith(mockSupabaseClient, 'user-123', '123e4567-e89b-12d3-a456-426614174000', expect.objectContaining({
                is_bookmarked: false
            }));
            expect(repo.deleteUserLibrary).not.toHaveBeenCalled();
        });
    });
});
