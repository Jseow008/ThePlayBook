import { POST } from '@/app/api/chat/author/route';
import { NextRequest } from 'next/server';
import { vi } from 'vitest';
import { createClient } from '@/lib/supabase/server';
import { rateLimit } from '@/lib/server/rate-limit';
import { recordAiRouteAbuse } from '@/lib/server/security-telemetry';
import { checkAiUsageQuota, recordGeneratedAiMessage } from '@/lib/server/ai-usage-quota';
import { streamText } from 'ai';

vi.mock('@/lib/supabase/server', () => ({
    createClient: vi.fn(),
}));

vi.mock('@/lib/server/rate-limit', () => ({
    rateLimit: vi.fn(),
    rateLimitFailureResponseWithTelemetry: vi.fn(({ result, message }) =>
        Response.json(
            { error: { code: 'RATE_LIMITED', message } },
            {
                status: 429,
                headers: { 'Retry-After': String(Math.ceil((result.retryAfterMs ?? 60_000) / 1000)) },
            },
        )
    ),
}));

vi.mock('@/lib/server/security-telemetry', () => ({
    recordAiRouteAbuse: vi.fn(),
}));

vi.mock('@/lib/server/ai-usage-quota', () => ({
    checkAiUsageQuota: vi.fn(),
    recordGeneratedAiMessage: vi.fn(),
    getQuotaExceededMessage: vi.fn((result) => `quota exceeded: ${result.blockedWindow}`),
}));

vi.mock('ai', () => ({
    smoothStream: vi.fn().mockReturnValue('mock-smooth-transform'),
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

async function finishLatestStream() {
    const options = (streamText as any).mock.calls.at(-1)?.[0];
    await options?.onFinish?.({});
}

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
        contentTitle: 'Test Source',
        messages: [{ role: 'user', content: 'Hello there' }],
    };

    beforeEach(() => {
        vi.clearAllMocks();
        process.env.ANTHROPIC_API_KEY = 'test-key';
        delete process.env.OPENAI_API_KEY;
        delete process.env.AI_PROVIDER;

        (createClient as any).mockResolvedValue(mockSupabaseClient);
        (rateLimit as any).mockResolvedValue({ success: true, retryAfterMs: 0 });
        (checkAiUsageQuota as any).mockResolvedValue({ allowed: true, windows: [] });
        (recordGeneratedAiMessage as any).mockResolvedValue(undefined);
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
            windowMs: 10 * 60_000,
            key: 'author-chat:guest',
        });
        expect(checkAiUsageQuota).not.toHaveBeenCalled();
        expect(recordGeneratedAiMessage).not.toHaveBeenCalled();
    });

    it('accepts legacy bookTitle payloads', async () => {
        const req = new NextRequest(new URL('http://localhost/api/chat/author'), {
            method: 'POST',
            body: JSON.stringify({
                ...validBody,
                contentTitle: undefined,
                bookTitle: 'Legacy Book',
            }),
        });

        const res = await POST(req);
        expect(res.status).toBe(200);
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
        expect(recordGeneratedAiMessage).not.toHaveBeenCalled();
        await finishLatestStream();
        expect(recordGeneratedAiMessage).toHaveBeenCalledWith(mockSupabaseClient, {
            userId: 'user-123',
            feature: 'author-chat',
        });
    });

    it('blocks signed-in generated author answers when the AI quota is exhausted', async () => {
        mockAuthUser.mockResolvedValueOnce({ data: { user: mockUser } });
        (checkAiUsageQuota as any).mockResolvedValueOnce({
            allowed: false,
            blockedWindow: 'month',
            limit: 300,
            used: 300,
            retryAfterMs: 86_400_000,
            resetAt: new Date('2026-06-01T00:00:00.000Z'),
            windows: [],
        });

        const req = new NextRequest(new URL('http://localhost/api/chat/author'), {
            method: 'POST',
            body: JSON.stringify(validBody),
        });

        const res = await POST(req);
        const json = await res.json();

        expect(res.status).toBe(429);
        expect(res.headers.get('Retry-After')).toBe('86400');
        expect(json.error.code).toBe('AI_QUOTA_EXCEEDED');
        expect(streamText).not.toHaveBeenCalled();
        expect(recordGeneratedAiMessage).not.toHaveBeenCalled();
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
        expect(recordAiRouteAbuse).toHaveBeenCalledWith(expect.objectContaining({
            signal: 'ai_invalid_payload',
            route: '/api/chat/author',
            reason: 'invalid_payload',
        }));
    });

    it('rejects whitespace-only author messages after normalization', async () => {
        const req = new NextRequest(new URL('http://localhost/api/chat/author'), {
            method: 'POST',
            body: JSON.stringify({
                ...validBody,
                messages: [{ role: 'user', content: '   ' }],
            }),
        });

        const res = await POST(req);
        expect(res.status).toBe(400);
        expect(streamText).not.toHaveBeenCalled();
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

    it('uses the lower author output cap and last 4 messages only', async () => {
        const req = new NextRequest(new URL('http://localhost/api/chat/author'), {
            method: 'POST',
            body: JSON.stringify({
                ...validBody,
                messages: Array.from({ length: 7 }, (_, index) => ({
                    role: index % 2 === 0 ? 'user' : 'assistant',
                    content: `author-message-${index + 1}`,
                })),
            }),
        });

        const res = await POST(req);

        expect(res.status).toBe(200);
        expect(streamText).toHaveBeenCalledWith(expect.objectContaining({
            maxOutputTokens: 400,
            messages: Array.from({ length: 7 }, (_, index) => ({
                role: index % 2 === 0 ? 'user' : 'assistant',
                content: `author-message-${index + 1}`,
            })).slice(-4),
        }));
    });
});
