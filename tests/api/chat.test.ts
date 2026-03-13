import { POST } from '@/app/api/chat/route';
import { NextRequest } from 'next/server';
import { vi } from 'vitest';
import { createClient } from '@/lib/supabase/server';
import { rateLimit } from '@/lib/server/rate-limit';
import { streamText } from 'ai';

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

vi.mock('@ai-sdk/anthropic', () => ({
    anthropic: vi.fn().mockReturnValue('mock-anthropic-model'),
}));

const embedContentMock = vi.fn();

vi.mock('@google/genai', () => ({
    GoogleGenAI: class {
        models = {
            embedContent: embedContentMock,
        };
    },
}));

describe('Chat API', () => {
    const mockUser = { id: 'user-123' };
    const mockAuthUser = vi.fn();
    const mockRpc = vi.fn();
    const mockFrom = vi.fn();
    const segmentFetchIn = vi.fn();
    const segmentEmbeddingsSelect = vi.fn();
    const libraryOrder = vi.fn();
    const libraryEq = vi.fn();
    const librarySelect = vi.fn();
    const defaultLibraryRows = [
        {
            content_id: 'content-1',
            is_bookmarked: true,
            progress: { isCompleted: true, lastReadAt: '2026-03-10T12:00:00.000Z' },
            last_interacted_at: '2026-03-10T12:00:00.000Z',
            content_item: { title: "Can't Hurt Me", author: 'David Goggins' },
        },
        {
            content_id: 'content-2',
            is_bookmarked: false,
            progress: { isCompleted: false, lastReadAt: '2026-03-08T09:00:00.000Z' },
            last_interacted_at: '2026-03-08T09:00:00.000Z',
            content_item: { title: 'Atomic Habits', author: 'James Clear' },
        },
    ];

    const mockSupabaseClient = {
        auth: { getUser: mockAuthUser },
        rpc: mockRpc,
        from: mockFrom,
    };

    beforeEach(() => {
        vi.clearAllMocks();
        process.env.GEMINI_API_KEY = 'gemini-test-key';
        process.env.ANTHROPIC_API_KEY = 'anthropic-test-key';
        delete process.env.AI_PROVIDER;
        delete process.env.OPENAI_API_KEY;

        (createClient as any).mockResolvedValue(mockSupabaseClient);
        (rateLimit as any).mockResolvedValue({ success: true, retryAfterMs: 0 });
        mockAuthUser.mockResolvedValue({ data: { user: mockUser } });
        mockRpc.mockResolvedValue({ data: [], error: null }); // default empty vector return
        embedContentMock.mockResolvedValue({
            embeddings: [{ values: Array.from({ length: 768 }, (_, index) => index / 1000) }],
        });
        segmentFetchIn.mockResolvedValue({ data: [], error: null });
        segmentEmbeddingsSelect.mockResolvedValue({ count: 1, error: null });
        libraryOrder.mockResolvedValue({ data: defaultLibraryRows, error: null });
        libraryEq.mockReturnValue({ order: libraryOrder });
        librarySelect.mockReturnValue({ eq: libraryEq });
        mockFrom.mockImplementation((table: string) => {
            if (table === 'user_library') {
                return {
                    select: librarySelect,
                };
            }

            if (table === 'segment') {
                return {
                    select: vi.fn().mockReturnValue({
                        in: segmentFetchIn,
                    }),
                };
            }

            if (table === 'segment_embedding_gemini') {
                return {
                    select: segmentEmbeddingsSelect,
                };
            }

            throw new Error(`Unexpected table: ${table}`);
        });
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

    it('returns a retrieval-specific 500 if GEMINI_API_KEY is missing', async () => {
        delete process.env.GEMINI_API_KEY;

        const req = new NextRequest(new URL('http://localhost/api/chat'), {
            method: 'POST',
            body: JSON.stringify({ messages: [{ role: 'user', content: 'Hello' }] })
        });

        const res = await POST(req);
        expect(res.status).toBe(500);
        const json = await res.json();
        expect(json.error.message).toContain('retrieval is not configured');
    });

    it('processes a valid request successfully via Gemini embeddings and RAG', async () => {
        mockRpc.mockResolvedValueOnce({
            data: [{ segment_id: 'segment-1', content_item_id: 'content-1', similarity: 0.82 }],
            error: null,
        });
        segmentFetchIn.mockResolvedValueOnce({
            data: [
                {
                    id: 'segment-1',
                    markdown_body: 'Discipline is choosing what matters most.',
                    content_item: { title: "Can't Hurt Me" },
                },
            ],
            error: null,
        });

        const req = new NextRequest(new URL('http://localhost/api/chat'), {
            method: 'POST',
            body: JSON.stringify({
                messages: [
                    {
                        role: 'user',
                        parts: [{ type: 'text', text: 'What themes show up across my saved books?' }],
                    },
                ],
            })
        });

        const res = await POST(req);

        expect(embedContentMock).toHaveBeenCalled();

        // Ensure vector search RPC was called
        expect(mockRpc).toHaveBeenCalledWith('match_library_segments_gemini', expect.any(Object));

        // Stream text mock returned a 200 response
        expect(res.status).toBe(200);
        expect(streamText).toHaveBeenCalledWith(expect.objectContaining({
            maxOutputTokens: 500,
        }));
    });

    it('answers inventory questions from library metadata without retrieval', async () => {
        const req = new NextRequest(new URL('http://localhost/api/chat'), {
            method: 'POST',
            body: JSON.stringify({
                messages: [{ role: 'user', content: 'What have I completed in my library?' }],
            }),
        });

        const res = await POST(req);

        expect(res.status).toBe(200);
        expect(embedContentMock).not.toHaveBeenCalled();
        expect(mockRpc).not.toHaveBeenCalled();
        expect(streamText).toHaveBeenCalledWith(expect.objectContaining({
            system: expect.stringContaining('Completed books: 1'),
        }));
        expect(streamText).toHaveBeenCalledWith(expect.objectContaining({
            system: expect.stringContaining('Saved but not started: 0'),
        }));
        expect(streamText).toHaveBeenCalledWith(expect.objectContaining({
            maxOutputTokens: 250,
        }));
    });

    it('uses hybrid context for book ranking questions', async () => {
        mockRpc.mockResolvedValueOnce({
            data: [{ segment_id: 'segment-1', content_item_id: 'content-1', similarity: 0.82 }],
            error: null,
        });
        segmentFetchIn.mockResolvedValueOnce({
            data: [
                {
                    id: 'segment-1',
                    markdown_body: 'Discipline is choosing what matters most.',
                    content_item: { title: "Can't Hurt Me" },
                },
            ],
            error: null,
        });

        const req = new NextRequest(new URL('http://localhost/api/chat'), {
            method: 'POST',
            body: JSON.stringify({
                messages: [{ role: 'user', content: 'Which saved book is most relevant to discipline, and why?' }],
            }),
        });

        const res = await POST(req);

        expect(res.status).toBe(200);
        expect(embedContentMock).toHaveBeenCalled();
        expect(mockRpc).toHaveBeenCalled();
        expect(streamText).toHaveBeenCalledWith(expect.objectContaining({
            system: expect.stringContaining('Library metadata:'),
        }));
        expect(streamText).toHaveBeenCalledWith(expect.objectContaining({
            system: expect.stringContaining('Retrieved passages:'),
        }));
        expect(streamText).toHaveBeenCalledWith(expect.objectContaining({
            maxOutputTokens: 450,
        }));
    });

    it('accepts legacy content-only messages', async () => {
        const req = new NextRequest(new URL('http://localhost/api/chat'), {
            method: 'POST',
            body: JSON.stringify({ messages: [{ role: 'user', content: 'Legacy payload' }] })
        });

        const res = await POST(req);
        expect(res.status).toBe(200);
    });

    it('keeps only the last 6 normalized messages', async () => {
        const messages = Array.from({ length: 7 }, (_, index) => ({
            role: index % 2 === 0 ? 'user' : 'assistant',
            content: `message-${index + 1}`,
        }));

        const req = new NextRequest(new URL('http://localhost/api/chat'), {
            method: 'POST',
            body: JSON.stringify({ messages }),
        });

        const res = await POST(req);

        expect(res.status).toBe(200);
        expect(streamText).toHaveBeenCalledWith(expect.objectContaining({
            messages: messages.slice(-6),
        }));
    });

    it('rejects requests when normalization produces no usable text', async () => {
        const req = new NextRequest(new URL('http://localhost/api/chat'), {
            method: 'POST',
            body: JSON.stringify({
                messages: [
                    {
                        role: 'user',
                        parts: [{ type: 'tool-invocation', toolName: 'search', args: {} }],
                    },
                ],
            })
        });

        const res = await POST(req);
        expect(res.status).toBe(400);

        const json = await res.json();
        expect(json.error.message).toContain('No valid messages');
    });

    it('rejects requests when the final normalized message is not from the user', async () => {
        const req = new NextRequest(new URL('http://localhost/api/chat'), {
            method: 'POST',
            body: JSON.stringify({
                messages: [
                    { role: 'user', parts: [{ type: 'text', text: 'Hello' }] },
                    { role: 'assistant', parts: [{ type: 'text', text: 'Hi there' }] },
                ],
            })
        });

        const res = await POST(req);
        expect(res.status).toBe(400);

        const json = await res.json();
        expect(json.error.message).toContain('Last message must be a user message');
    });

    it('returns a retrieval initialization error when no Gemini segment embeddings exist yet and no library metadata exists', async () => {
        segmentEmbeddingsSelect.mockResolvedValueOnce({ count: 0, error: null });
        libraryOrder.mockResolvedValueOnce({ data: [], error: null });

        const req = new NextRequest(new URL('http://localhost/api/chat'), {
            method: 'POST',
            body: JSON.stringify({ messages: [{ role: 'user', content: 'What is this about?' }] })
        });

        const res = await POST(req);
        expect(res.status).toBe(500);

        const json = await res.json();
        expect(json.error.message).toContain('run Sync AI Segments');
    });
});
