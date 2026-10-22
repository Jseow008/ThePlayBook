import { GET, PATCH, DELETE } from '@/app/api/library/highlights/[id]/route';
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
    const currentHighlight = {
        id: '123e4567-e89b-12d3-a456-426614174000',
        user_id: mockUser.id,
        content_item_id: '123e4567-e89b-12d3-a456-426614174001',
        segment_id: '123e4567-e89b-12d3-a456-426614174002',
        highlighted_text: 'Existing highlight',
        note_body: null,
        color: 'yellow',
        anchor_start: 0,
        anchor_end: 18,
        created_at: '2026-07-29T00:00:00.000Z',
        updated_at: null,
    };
    const deleteBuilder: any = {
        eq: vi.fn().mockReturnThis(),
        then: vi.fn((resolve) => resolve({ data: null, error: null })),
    };
    const updateBuilder: any = {
        eq: vi.fn().mockReturnThis(),
        is: vi.fn().mockReturnThis(),
        maybeSingle: vi.fn().mockReturnThis(),
        select: vi.fn().mockReturnThis(),
        single: vi.fn().mockReturnThis(),
        then: vi.fn((resolve) => resolve({ data: currentHighlight, error: null })),
    };
    const currentBuilder: any = {
        eq: vi.fn().mockReturnThis(),
        maybeSingle: vi.fn(),
    };
    const overlapBuilder: any = {
        eq: vi.fn().mockReturnThis(),
        neq: vi.fn().mockReturnThis(),
        lt: vi.fn().mockReturnThis(),
        gt: vi.fn().mockReturnThis(),
        order: vi.fn().mockReturnThis(),
        limit: vi.fn().mockReturnThis(),
        maybeSingle: vi.fn(),
    };

    const deleteMock = vi.fn().mockReturnValue(deleteBuilder);
    const updateMock = vi.fn().mockReturnValue(updateBuilder);
    const selectMock = vi.fn();
    const mockSupabaseClient = {
        auth: { getUser: mockAuthUser },
        from: vi.fn().mockReturnValue({
            delete: deleteMock,
            update: updateMock,
            select: selectMock,
        })
    };

    beforeEach(() => {
        vi.clearAllMocks();

        (createClient as any).mockResolvedValue(mockSupabaseClient);
        (rateLimit as any).mockResolvedValue({ success: true });
        mockAuthUser.mockResolvedValue({ data: { user: mockUser } });

        deleteBuilder.then.mockImplementation((resolve: any) => resolve({ data: null, error: null }));
        updateBuilder.then.mockImplementation((resolve: any) => resolve({ data: currentHighlight, error: null }));
        currentBuilder.maybeSingle.mockReset().mockResolvedValue({ data: currentHighlight, error: null });
        overlapBuilder.maybeSingle.mockResolvedValue({ data: null, error: null });
        selectMock.mockReset();
        selectMock.mockReturnValueOnce(currentBuilder).mockReturnValue(overlapBuilder);
    });

    describe('GET point lookup', () => {
        const params = { params: Promise.resolve({ id: currentHighlight.id }) };
        it('checks ownership and returns a target without pagination', async () => {
            currentBuilder.maybeSingle.mockResolvedValueOnce({ data: { ...currentHighlight, content_item: { id: currentHighlight.content_item_id } }, error: null });
            const res = await GET(new NextRequest(`http://localhost/api/library/highlights/${currentHighlight.id}`), params);
            expect(res.status).toBe(200);
            expect(currentBuilder.eq).toHaveBeenCalledWith('user_id', mockUser.id);
            expect(res.headers.get('cache-control')).toBe('private, no-store');
        });
        it('distinguishes missing or inaccessible targets from request failures', async () => {
            selectMock.mockReset().mockReturnValue(currentBuilder);
            currentBuilder.maybeSingle.mockResolvedValueOnce({ data: null, error: null });
            expect((await GET(new NextRequest('http://localhost'), params)).status).toBe(404);
            currentBuilder.maybeSingle.mockResolvedValueOnce({ data: null, error: { message: 'unavailable database' } });
            expect((await GET(new NextRequest('http://localhost'), params)).status).toBe(500);
        });
        it('requires authentication', async () => {
            mockAuthUser.mockResolvedValueOnce({ data: { user: null } });
            expect((await GET(new NextRequest('http://localhost'), params)).status).toBe(401);
        });
    });

    it('rejects stale note updates atomically instead of overwriting', async () => {
        updateBuilder.then.mockImplementationOnce((resolve: any) => resolve({ data: null, error: null }));
        const res = await PATCH(new NextRequest('http://localhost', { method: 'PATCH', body: JSON.stringify({ note_body: 'stale draft', expected: { note_body: null, color: 'yellow', updated_at: null } }) }), { params: Promise.resolve({ id: currentHighlight.id }) });
        expect(res.status).toBe(409);
        expect((await res.json()).error.code).toBe('STALE_HIGHLIGHT');
        expect(updateBuilder.is).toHaveBeenCalledWith('note_body', null);
        expect(updateBuilder.is).toHaveBeenCalledWith('updated_at', null);
        expect(updateBuilder.eq).toHaveBeenCalledWith('color', 'yellow');
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
            expect(deleteMock).toHaveBeenCalled();
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

        it('explains a rejected over-limit note without performing an update', async () => {
            const res = await PATCH(new NextRequest('http://localhost', { method: 'PATCH', body: JSON.stringify({ note_body: 'x'.repeat(4001) }) }), { params: Promise.resolve({ id: currentHighlight.id }) });
            expect(res.status).toBe(400);
            expect((await res.json()).error.message).toContain('4,000 characters');
            expect(updateMock).not.toHaveBeenCalled();
        });

        it('updates highlight color and note', async () => {
            const req = new NextRequest(new URL('http://localhost/api/library/highlights/123e4567-e89b-12d3-a456-426614174000'), {
                method: 'PATCH',
                body: JSON.stringify({ color: 'blue', note_body: 'Testing note' })
            });

            const res = await PATCH(req, { params: Promise.resolve({ id: '123e4567-e89b-12d3-a456-426614174000' }) });

            expect(res.status).toBe(200);
            expect(mockSupabaseClient.from).toHaveBeenCalledWith('user_highlights');
        });

        it('updates highlight text and anchors together', async () => {
            const req = new NextRequest(new URL('http://localhost/api/library/highlights/123e4567-e89b-12d3-a456-426614174000'), {
                method: 'PATCH',
                body: JSON.stringify({
                    highlighted_text: 'Replacement passage',
                    anchor_start: 20,
                    anchor_end: 39,
                })
            });

            const res = await PATCH(req, { params: Promise.resolve({ id: '123e4567-e89b-12d3-a456-426614174000' }) });

            expect(res.status).toBe(200);
            expect(updateMock).toHaveBeenCalledWith(expect.objectContaining({
                highlighted_text: 'Replacement passage',
                anchor_start: 20,
                anchor_end: 39,
            }));
        });

        it('rejects partial range replacement payloads', async () => {
            const req = new NextRequest(new URL('http://localhost/api/library/highlights/123e4567-e89b-12d3-a456-426614174000'), {
                method: 'PATCH',
                body: JSON.stringify({ highlighted_text: 'Missing anchors' })
            });

            const res = await PATCH(req, { params: Promise.resolve({ id: '123e4567-e89b-12d3-a456-426614174000' }) });
            expect(res.status).toBe(400);
        });
    });
});
