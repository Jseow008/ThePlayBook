import { POST } from '@/app/api/recommendations/route';
import { NextRequest } from 'next/server';
import { vi } from 'vitest';
import { createPublicServerClient } from '@/lib/supabase/public-server';
import { rateLimit } from '@/lib/server/rate-limit';

vi.mock('@/lib/supabase/public-server', () => ({
    createPublicServerClient: vi.fn(),
}));

vi.mock('@/lib/server/rate-limit', () => ({
    rateLimit: vi.fn(),
}));

describe('Recommendations API', () => {
    const mockRpc = vi.fn();
    const mockSupabaseClient = {
        rpc: mockRpc,
    };

    beforeEach(() => {
        vi.clearAllMocks();

        (createPublicServerClient as any).mockReturnValue(mockSupabaseClient);
        (rateLimit as any).mockResolvedValue({ success: true });
        mockRpc.mockResolvedValue({ data: [{ id: '123', title: 'Test Item' }], error: null });
    });

    it('validates request payload', async () => {
        const req = new NextRequest(new URL('http://localhost/api/recommendations'), {
            method: 'POST',
            body: JSON.stringify({ completedIds: ['invalid-id'] })
        });

        const res = await POST(req);
        expect(res.status).toBe(400); // Invalid UUID
    });

    it('returns empty array if no completedIds are provided', async () => {
        const req = new NextRequest(new URL('http://localhost/api/recommendations'), {
            method: 'POST',
            body: JSON.stringify({ completedIds: [] })
        });

        const res = await POST(req);
        expect(res.status).toBe(200);

        const json = await res.json();
        expect(json).toEqual([]);
        expect(mockRpc).not.toHaveBeenCalled();
    });

    it('fetches recommendations using RPC', async () => {
        const validId = '123e4567-e89b-12d3-a456-426614174000';
        const req = new NextRequest(new URL('http://localhost/api/recommendations'), {
            method: 'POST',
            body: JSON.stringify({ completedIds: [validId, validId] }) // test deduplication
        });

        const res = await POST(req);
        expect(res.status).toBe(200);

        expect(mockRpc).toHaveBeenCalledWith('match_recommendations', {
            completed_ids: [validId], // Deduplicated
            match_count: 10,
        });

        const json = await res.json();
        expect(json.length).toBe(1);
    });

    it('handles RPC errors', async () => {
        mockRpc.mockResolvedValueOnce({ error: new Error('RPC Failed') });

        const validId = '123e4567-e89b-12d3-a456-426614174000';
        const req = new NextRequest(new URL('http://localhost/api/recommendations'), {
            method: 'POST',
            body: JSON.stringify({ completedIds: [validId] })
        });

        const res = await POST(req);
        expect(res.status).toBe(500);
    });
});
