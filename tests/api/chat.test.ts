import { POST } from '@/app/api/chat/route';
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

// Mock streamText to avoid actual AI call
vi.mock('ai', () => ({
    streamText: vi.fn().mockImplementation(() => ({
        toTextStreamResponse: () => new Response('mocked-stream')
    })),
}));

describe('Chat API', () => {
    const mockUser = { id: 'user-123' };
    const mockAuthUser = vi.fn();
    const mockRpc = vi.fn();

    const mockSupabaseClient = {
        auth: { getUser: mockAuthUser },
        rpc: mockRpc,
    };

    beforeEach(() => {
        vi.clearAllMocks();
        process.env.OPENAI_API_KEY = 'test-key';

        (createClient as any).mockResolvedValue(mockSupabaseClient);
        (rateLimit as any).mockResolvedValue({ success: true, retryAfterMs: 0 });
        mockAuthUser.mockResolvedValue({ data: { user: mockUser } });
        mockRpc.mockResolvedValue({ data: [], error: null }); // default empty vector return

        // Mock global fetch for embeddings
        global.fetch = vi.fn().mockResolvedValue({
            ok: true,
            json: async () => ({
                data: [{ embedding: [0.1, 0.2, 0.3] }]
            })
        });
    });

    afterEach(() => {
        vi.unstubAllGlobals();
    });

    it('requires authentication', async () => {
        mockAuthUser.mockResolvedValueOnce({ data: { user: null }, error: new Error('unauth') });

        const req = new NextRequest(new URL('http://localhost/api/chat'), {
            method: 'POST',
            body: JSON.stringify({ messages: [{ role: 'user', content: 'Hello' }] })
        });

        const res = await POST(req);
        expect(res.status).toBe(401);
    });

    it('validates messages payload', async () => {
        const req = new NextRequest(new URL('http://localhost/api/chat'), {
            method: 'POST',
            body: JSON.stringify({ messages: [] }) // Empty messages
        });

        const res = await POST(req);
        expect(res.status).toBe(400); // Bad request

        const json = await res.json();
        expect(json.error.code).toBe('VALIDATION_ERROR');
    });

    it('returns 500 if OPENAI_API_KEY is missing', async () => {
        delete process.env.OPENAI_API_KEY;

        const req = new NextRequest(new URL('http://localhost/api/chat'), {
            method: 'POST',
            body: JSON.stringify({ messages: [{ role: 'user', content: 'Hello' }] })
        });

        const res = await POST(req);
        expect(res.status).toBe(500);
    });

    it('processes a valid request successfully via OpenAI embeddings and RAG', async () => {
        const req = new NextRequest(new URL('http://localhost/api/chat'), {
            method: 'POST',
            body: JSON.stringify({ messages: [{ role: 'user', content: 'What is this about?' }] })
        });

        const res = await POST(req);

        // Ensure embeddings fetch was called
        expect(global.fetch).toHaveBeenCalledWith(
            'https://api.openai.com/v1/embeddings',
            expect.objectContaining({
                method: 'POST',
            })
        );

        // Ensure vector search RPC was called
        expect(mockRpc).toHaveBeenCalledWith('match_library_segments', expect.any(Object));

        // Stream text mock returned a 200 response
        expect(res.status).toBe(200);
    });
});
