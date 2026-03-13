import { POST } from '@/app/api/chat/author/route';
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

vi.mock('ai', () => ({
    streamText: vi.fn().mockImplementation(() => ({
        toTextStreamResponse: () => new Response('mocked-stream')
    })),
}));

vi.mock('@ai-sdk/anthropic', () => ({
    anthropic: vi.fn().mockReturnValue('mock-anthropic-model'),
}));

vi.mock('@ai-sdk/openai', () => ({
    openai: vi.fn().mockReturnValue('mock-openai-model'),
}));

describe('Author Chat API', () => {
    const mockUser = { id: 'user-123' };
    const mockAuthUser = vi.fn();
    const select = vi.fn();
    const eq = vi.fn();
    const order = vi.fn();

    const queryBuilder = {
        select,
        eq,
        order,
    };

    const mockSupabaseClient = {
        auth: { getUser: mockAuthUser },
        from: vi.fn(() => queryBuilder),
    };

    const validBody = {
        contentId: '123e4567-e89b-12d3-a456-426614174000',
        authorName: 'Test Author',
        bookTitle: 'Test Book',
        messages: [{ role: 'user', content: 'Hello there' }],
    };

    beforeEach(() => {
        vi.clearAllMocks();
        process.env.ANTHROPIC_API_KEY = 'test-key';
        delete process.env.OPENAI_API_KEY;
        delete process.env.AI_PROVIDER;

        (createClient as any).mockResolvedValue(mockSupabaseClient);
        (rateLimit as any).mockResolvedValue({ success: true, retryAfterMs: 0 });
        mockAuthUser.mockResolvedValue({ data: { user: null } });

        select.mockReturnValue(queryBuilder);
        eq.mockReturnValue(queryBuilder);
        order.mockReturnValue({
            data: [{ title: 'Intro', markdown_body: 'Segment body', order_index: 0 }],
            error: null,
        });
    });

    it('allows valid guest requests', async () => {
        const req = new NextRequest(new URL('http://localhost/api/chat/author'), {
            method: 'POST',
            body: JSON.stringify(validBody),
        });

        const res = await POST(req);
        expect(res.status).toBe(200);
        expect(rateLimit).toHaveBeenCalledWith(req, {
            limit: 3,
            windowMs: 60_000,
            key: 'author-chat:guest',
        });
    });

    it('allows valid signed-in requests with user-scoped throttling', async () => {
        mockAuthUser.mockResolvedValueOnce({ data: { user: mockUser } });

        const req = new NextRequest(new URL('http://localhost/api/chat/author'), {
            method: 'POST',
            body: JSON.stringify(validBody),
        });

        const res = await POST(req);
        expect(res.status).toBe(200);
        expect(rateLimit).toHaveBeenCalledWith(req, {
            limit: 10,
            windowMs: 60_000,
            key: 'author-chat:user',
            identifier: 'user-123',
        });
    });

    it('rate limits guests at the guest quota', async () => {
        (rateLimit as any).mockResolvedValueOnce({ success: false, retryAfterMs: 20_000 });

        const req = new NextRequest(new URL('http://localhost/api/chat/author'), {
            method: 'POST',
            body: JSON.stringify(validBody),
        });

        const res = await POST(req);
        expect(res.status).toBe(429);
        expect(await res.json()).toEqual({
            error: {
                code: 'RATE_LIMITED',
                message: 'Too many requests. Please wait 20 seconds and try again.',
            },
        });
    });

    it('rate limits signed-in users at the authenticated quota', async () => {
        mockAuthUser.mockResolvedValueOnce({ data: { user: mockUser } });
        (rateLimit as any).mockResolvedValueOnce({ success: false, retryAfterMs: 61_000 });

        const req = new NextRequest(new URL('http://localhost/api/chat/author'), {
            method: 'POST',
            body: JSON.stringify(validBody),
        });

        const res = await POST(req);
        expect(res.status).toBe(429);
        expect(rateLimit).toHaveBeenCalledWith(req, {
            limit: 10,
            windowMs: 60_000,
            key: 'author-chat:user',
            identifier: 'user-123',
        });
        expect(await res.json()).toEqual({
            error: {
                code: 'RATE_LIMITED',
                message: 'Too many requests. Please wait 61 seconds and try again.',
            },
        });
    });

    it('validates payloads', async () => {
        const req = new NextRequest(new URL('http://localhost/api/chat/author'), {
            method: 'POST',
            body: JSON.stringify({ ...validBody, messages: [] }),
        });

        const res = await POST(req);
        expect(res.status).toBe(400);

        const json = await res.json();
        expect(json.error.code).toBe('VALIDATION_ERROR');
    });

    it('prefers Anthropic Sonnet by default when both providers are configured', async () => {
        process.env.OPENAI_API_KEY = 'openai-test-key';

        const req = new NextRequest(new URL('http://localhost/api/chat/author'), {
            method: 'POST',
            body: JSON.stringify(validBody),
        });

        const res = await POST(req);

        expect(res.status).toBe(200);
    });
});
