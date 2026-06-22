import { POST } from '@/app/api/recommendations/route';
import { NextRequest } from 'next/server';
import { vi } from 'vitest';
import { createPublicServerClient } from '@/lib/supabase/public-server';
import { rateLimitFailureResponse, strictPublicRateLimit } from '@/lib/server/rate-limit';

vi.mock('@/lib/supabase/public-server', () => ({
    createPublicServerClient: vi.fn(),
}));

vi.mock('@/lib/server/rate-limit', () => ({
    strictPublicRateLimit: vi.fn(),
    rateLimitFailureResponse: vi.fn((result: { unavailable?: boolean }) => Response.json(
        {
            error: {
                code: result.unavailable ? "RATE_LIMIT_UNAVAILABLE" : "RATE_LIMITED",
                message: result.unavailable ? "Service temporarily unavailable." : "Too many requests.",
            },
        },
        { status: result.unavailable ? 503 : 429 }
    )),
    RateLimitBackendUnavailableError: class RateLimitBackendUnavailableError extends Error {},
}));

describe('Recommendations API', () => {
    const mockRpc = vi.fn();
    const mockSupabaseClient = {
        rpc: mockRpc,
    };

    beforeEach(() => {
        vi.clearAllMocks();

        (createPublicServerClient as any).mockReturnValue(mockSupabaseClient);
        (strictPublicRateLimit as any).mockResolvedValue({ success: true });
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
            seed_ids: [validId],
            exclude_ids: [validId],
            match_count: 40,
        });

        const json = await res.json();
        expect(json.length).toBe(1);
    });

    it('supports separate seed and exclusion ids', async () => {
        const seedId = '123e4567-e89b-12d3-a456-426614174000';
        const completedId = '123e4567-e89b-12d3-a456-426614174001';
        const recentId = '123e4567-e89b-12d3-a456-426614174002';
        const req = new NextRequest(new URL('http://localhost/api/recommendations'), {
            method: 'POST',
            body: JSON.stringify({
                seedIds: [seedId, seedId],
                completedIds: [completedId],
                excludeIds: [recentId, recentId],
                matchCount: 3,
            }),
        });

        const res = await POST(req);
        expect(res.status).toBe(200);

        expect(mockRpc).toHaveBeenCalledWith('match_recommendations', {
            seed_ids: [seedId],
            exclude_ids: [seedId, completedId, recentId],
            match_count: 12,
        });
    });

    it('accepts larger exclusion sets for high-history users', async () => {
        const seedId = '123e4567-e89b-12d3-a456-426614174000';
        const excludeIds = Array.from({ length: 120 }, (_, index) =>
            `123e4567-e89b-12d3-a456-426614174${String(index).padStart(3, '0')}`
        );
        const req = new NextRequest(new URL('http://localhost/api/recommendations'), {
            method: 'POST',
            body: JSON.stringify({
                seedIds: [seedId],
                excludeIds,
            }),
        });

        const res = await POST(req);
        expect(res.status).toBe(200);
        expect(mockRpc).toHaveBeenCalledWith('match_recommendations', {
            seed_ids: [seedId],
            exclude_ids: Array.from(new Set([seedId, ...excludeIds])),
            match_count: 40,
        });
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

    it('fails closed before querying when the strict rate-limit backend is unavailable', async () => {
        (strictPublicRateLimit as any).mockResolvedValueOnce({
            success: false,
            retryAfterMs: 60_000,
            unavailable: true,
        });

        const validId = '123e4567-e89b-12d3-a456-426614174000';
        const req = new NextRequest(new URL('http://localhost/api/recommendations'), {
            method: 'POST',
            body: JSON.stringify({ completedIds: [validId] })
        });

        const res = await POST(req);
        expect(res.status).toBe(503);
        await expect(res.json()).resolves.toEqual({
            error: {
                code: "RATE_LIMIT_UNAVAILABLE",
                message: "Service temporarily unavailable.",
            },
        });
        expect(rateLimitFailureResponse).toHaveBeenCalledWith({
            success: false,
            retryAfterMs: 60_000,
            unavailable: true,
        });
        expect(mockRpc).not.toHaveBeenCalled();
    });
});
