import { PATCH, DELETE } from '@/app/api/library/highlights/[id]/route';
import { NextRequest } from 'next/server';
import { vi } from 'vitest';
import { createClient } from '@/lib/supabase/server';
import { rateLimit } from '@/lib/server/rate-limit';

vi.mock('@/lib/supabase/server', () => ({
    createClient: vi.fn(),
}));

vi.mock('@/lib/server/rate-limit', () => ({
    rateLimit: vi.fn(),
}));

describe('Highlights API', () => {
    const mockUser = { id: 'user-123' };
    const mockAuthUser = vi.fn();

    const mockBuilder: any = {
        eq: vi.fn().mockReturnThis(),
        select: vi.fn().mockReturnThis(),
        single: vi.fn().mockReturnThis(),
        then: vi.fn((resolve) => resolve({ data: null, error: null })),
    };

    const mockSupabaseClient = {
        auth: { getUser: mockAuthUser },
        from: vi.fn().mockReturnValue({
            delete: vi.fn().mockReturnValue(mockBuilder),
            update: vi.fn().mockReturnValue(mockBuilder),
        })
    };

    beforeEach(() => {
        vi.clearAllMocks();

        (createClient as any).mockResolvedValue(mockSupabaseClient);
        (rateLimit as any).mockResolvedValue({ success: true });
        mockAuthUser.mockResolvedValue({ data: { user: mockUser } });

        // Reset builder `then` to default successful resolve
        mockBuilder.then.mockImplementation((resolve: any) => resolve({ data: null, error: null }));
    });

    describe('DELETE /[id]', () => {
        it('requires authentication', async () => {
            mockAuthUser.mockResolvedValueOnce({ data: { user: null } });
            const req = new NextRequest(new URL('http://localhost/api/library/highlights/123e4567-e89b-12d3-a456-426614174000'), { method: 'DELETE' });
            const res = await DELETE(req, { params: Promise.resolve({ id: '123e4567-e89b-12d3-a456-426614174000' }) });
            expect(res.status).toBe(401);
        });

        it('validates UUID', async () => {
            const req = new NextRequest(new URL('http://localhost/api/library/highlights/invalid-id'), { method: 'DELETE' });
            const res = await DELETE(req, { params: Promise.resolve({ id: 'invalid-id' }) });
            expect(res.status).toBe(400);
        });

        it('deletes the highlight', async () => {
            const req = new NextRequest(new URL('http://localhost/api/library/highlights/123e4567-e89b-12d3-a456-426614174000'), { method: 'DELETE' });
            const res = await DELETE(req, { params: Promise.resolve({ id: '123e4567-e89b-12d3-a456-426614174000' }) });

            expect(res.status).toBe(200);
            expect(mockSupabaseClient.from).toHaveBeenCalledWith('user_highlights');
            expect(mockSupabaseClient.from().delete).toHaveBeenCalled();
        });
    });

    describe('PATCH /[id]', () => {
        it('validates payload is provided', async () => {
            const req = new NextRequest(new URL('http://localhost/api/library/highlights/123e4567-e89b-12d3-a456-426614174000'), {
                method: 'PATCH',
                body: JSON.stringify({}) // empty payload
            });
            const res = await PATCH(req, { params: Promise.resolve({ id: '123e4567-e89b-12d3-a456-426614174000' }) });
            expect(res.status).toBe(400);
        });

        it('updates highlight color and note', async () => {
            mockBuilder.then.mockImplementationOnce((resolve: any) => resolve({ data: { id: '123', color: 'blue' }, error: null }));

            const req = new NextRequest(new URL('http://localhost/api/library/highlights/123e4567-e89b-12d3-a456-426614174000'), {
                method: 'PATCH',
                body: JSON.stringify({ color: 'blue', note_body: 'Testing note' })
            });

            const res = await PATCH(req, { params: Promise.resolve({ id: '123e4567-e89b-12d3-a456-426614174000' }) });

            expect(res.status).toBe(200);
            expect(mockSupabaseClient.from).toHaveBeenCalledWith('user_highlights');
        });
    });
});
