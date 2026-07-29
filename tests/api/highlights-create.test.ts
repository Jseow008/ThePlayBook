import { POST } from '@/app/api/library/highlights/route';
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

describe('Create highlight API', () => {
    const mockUser = { id: '123e4567-e89b-12d3-a456-426614174000' };
    const mockAuthUser = vi.fn();
    const headBuilder = {
        eq: vi.fn().mockReturnThis(),
        then: vi.fn((resolve) => resolve({ count: 0, error: null })),
    };
    const overlapBuilder = {
        eq: vi.fn().mockReturnThis(),
        lt: vi.fn().mockReturnThis(),
        gt: vi.fn().mockReturnThis(),
        order: vi.fn().mockReturnThis(),
        limit: vi.fn().mockReturnThis(),
        maybeSingle: vi.fn(),
    };
    const insertBuilder = {
        select: vi.fn().mockReturnThis(),
        single: vi.fn().mockReturnThis(),
        then: vi.fn((resolve) => resolve({ data: { id: 'highlight-1' }, error: null })),
    };
    const insertMock = vi.fn().mockReturnValue(insertBuilder);

    const mockSupabaseClient = {
        auth: { getUser: mockAuthUser },
        from: vi.fn((table: string) => ({
            select: vi.fn((_query?: string, options?: { count?: string; head?: boolean }) => {
                if (table === 'user_highlights' && options?.head) {
                    return headBuilder;
                }
                return overlapBuilder;
            }),
            insert: insertMock,
        })),
    };

    beforeEach(() => {
        vi.clearAllMocks();
        (createClient as any).mockResolvedValue(mockSupabaseClient);
        (rateLimit as any).mockResolvedValue({ success: true });
        mockAuthUser.mockResolvedValue({ data: { user: mockUser } });
        headBuilder.then.mockImplementation((resolve: any) => resolve({ count: 0, error: null }));
        overlapBuilder.maybeSingle.mockResolvedValue({ data: null, error: null });
        insertBuilder.then.mockImplementation((resolve: any) => resolve({ data: { id: 'highlight-1' }, error: null }));
    });

    it('creates a highlight with anchor offsets', async () => {
        const req = new NextRequest(new URL('http://localhost/api/library/highlights'), {
            method: 'POST',
            body: JSON.stringify({
                content_item_id: '123e4567-e89b-12d3-a456-426614174001',
                segment_id: '123e4567-e89b-12d3-a456-426614174002',
                highlighted_text: 'Anchored text',
                anchor_start: 5,
                anchor_end: 18,
            }),
        });

        const res = await POST(req);

        expect(res.status).toBe(200);
        expect(mockSupabaseClient.from).toHaveBeenCalledWith('user_highlights');
        expect((await res.json()).disposition).toBe('created');
    });

    it('returns the existing record for an exact duplicate range', async () => {
        overlapBuilder.maybeSingle.mockResolvedValueOnce({
            data: {
                id: '123e4567-e89b-12d3-a456-426614174099',
                user_id: mockUser.id,
                content_item_id: '123e4567-e89b-12d3-a456-426614174001',
                segment_id: '123e4567-e89b-12d3-a456-426614174002',
                highlighted_text: 'Anchored text',
                note_body: null,
                color: 'yellow',
                anchor_start: 5,
                anchor_end: 18,
                created_at: '2026-07-29T00:00:00.000Z',
                updated_at: null,
            },
            error: null,
        });

        const req = new NextRequest(new URL('http://localhost/api/library/highlights'), {
            method: 'POST',
            body: JSON.stringify({
                content_item_id: '123e4567-e89b-12d3-a456-426614174001',
                segment_id: '123e4567-e89b-12d3-a456-426614174002',
                highlighted_text: 'Anchored text',
                anchor_start: 5,
                anchor_end: 18,
            }),
        });

        const res = await POST(req);
        const body = await res.json();

        expect(res.status).toBe(200);
        expect(body.disposition).toBe('existing');
        expect(body.data.id).toBe('123e4567-e89b-12d3-a456-426614174099');
        expect(insertMock).not.toHaveBeenCalled();
    });

    it('rejects a nested selection with structured overlap details', async () => {
        overlapBuilder.maybeSingle.mockResolvedValueOnce({
            data: {
                id: '123e4567-e89b-12d3-a456-426614174099',
                user_id: mockUser.id,
                content_item_id: '123e4567-e89b-12d3-a456-426614174001',
                segment_id: '123e4567-e89b-12d3-a456-426614174002',
                highlighted_text: 'A longer anchored passage',
                note_body: null,
                color: 'yellow',
                anchor_start: 0,
                anchor_end: 30,
                created_at: '2026-07-29T00:00:00.000Z',
                updated_at: null,
            },
            error: null,
        });

        const req = new NextRequest(new URL('http://localhost/api/library/highlights'), {
            method: 'POST',
            body: JSON.stringify({
                content_item_id: '123e4567-e89b-12d3-a456-426614174001',
                segment_id: '123e4567-e89b-12d3-a456-426614174002',
                highlighted_text: 'anchored',
                anchor_start: 9,
                anchor_end: 17,
            }),
        });

        const res = await POST(req);
        const body = await res.json();

        expect(res.status).toBe(409);
        expect(body.error.details).toEqual({
            existing_highlight_id: '123e4567-e89b-12d3-a456-426614174099',
            relationship: 'contained',
        });
    });

    it('still allows legacy highlight creation without anchors', async () => {
        const req = new NextRequest(new URL('http://localhost/api/library/highlights'), {
            method: 'POST',
            body: JSON.stringify({
                content_item_id: '123e4567-e89b-12d3-a456-426614174001',
                segment_id: '123e4567-e89b-12d3-a456-426614174002',
                highlighted_text: 'Legacy text',
            }),
        });

        const res = await POST(req);
        expect(res.status).toBe(200);
    });
});
