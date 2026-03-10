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
    const insertBuilder = {
        select: vi.fn().mockReturnThis(),
        single: vi.fn().mockReturnThis(),
        then: vi.fn((resolve) => resolve({ data: { id: 'highlight-1' }, error: null })),
    };

    const mockSupabaseClient = {
        auth: { getUser: mockAuthUser },
        from: vi.fn((table: string) => ({
            select: vi.fn((_query?: string, options?: { count?: string; head?: boolean }) => {
                if (table === 'user_highlights' && options?.head) {
                    return headBuilder;
                }
                return headBuilder;
            }),
            insert: vi.fn().mockReturnValue(insertBuilder),
        })),
    };

    beforeEach(() => {
        vi.clearAllMocks();
        (createClient as any).mockResolvedValue(mockSupabaseClient);
        (rateLimit as any).mockResolvedValue({ success: true });
        mockAuthUser.mockResolvedValue({ data: { user: mockUser } });
        headBuilder.then.mockImplementation((resolve: any) => resolve({ count: 0, error: null }));
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
