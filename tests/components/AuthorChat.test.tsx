import { render, screen, fireEvent } from '@testing-library/react';
import { AuthorChat } from '@/components/reader/AuthorChat';
import { useChat } from '@ai-sdk/react';
import { vi } from 'vitest';

vi.mock('@ai-sdk/react', () => ({
    useChat: vi.fn(),
}));

describe('AuthorChat', () => {
    const mockOnClose = vi.fn();
    const defaultProps = {
        contentId: '123',
        authorName: 'Test Author',
        bookTitle: 'Test Book',
        onClose: mockOnClose,
    };

    beforeEach(() => {
        vi.clearAllMocks();
        // Setup default mock implementation for useChat
        (useChat as any).mockReturnValue({
            messages: [],
            sendMessage: vi.fn(),
            status: 'ready',
            error: null,
        });
    });

    it('renders the chat interface with author details', () => {
        render(<AuthorChat {...defaultProps} />);

        // Header
        expect(screen.getByText('Test Author')).toBeInTheDocument();

        // Welcome message contains author name and book title
        expect(screen.getByText(/You've just finished reading my work/i)).toBeInTheDocument();
        expect(screen.getByText('Test Book')).toBeInTheDocument();
    });

    it('calls onClose when close button is clicked', () => {
        render(<AuthorChat {...defaultProps} />);
        const closeButton = screen.getByRole('button', { name: /close chat/i });
        fireEvent.click(closeButton);
        expect(mockOnClose).toHaveBeenCalledTimes(1);
    });

    it('can submit a message', async () => {
        const mockSendMessage = vi.fn();
        (useChat as any).mockReturnValue({
            messages: [],
            sendMessage: mockSendMessage,
            status: 'ready',
            error: null,
        });

        render(<AuthorChat {...defaultProps} />);

        const input = screen.getByRole('textbox', { name: /Ask Test Author a question/i });
        fireEvent.change(input, { target: { value: 'Hello there' } });

        const form = input.closest('form');
        expect(form).toBeInTheDocument();

        fireEvent.submit(form!);

        expect(mockSendMessage).toHaveBeenCalledWith({ text: 'Hello there' });
    });

    it('renders assistant message from content when parts are undefined', () => {
        (useChat as any).mockReturnValue({
            messages: [
                {
                    id: 'm1',
                    role: 'assistant',
                    content: 'Message from content fallback',
                },
            ],
            sendMessage: vi.fn(),
            status: 'ready',
            error: null,
        });

        render(<AuthorChat {...defaultProps} />);
        expect(screen.getByText('Message from content fallback')).toBeInTheDocument();
    });

    it('prefers text assembled from parts over content', () => {
        (useChat as any).mockReturnValue({
            messages: [
                {
                    id: 'm2',
                    role: 'assistant',
                    content: 'Should not be shown',
                    parts: [
                        { type: 'text', text: 'Message from ' },
                        { type: 'text', text: 'parts' },
                    ],
                },
            ],
            sendMessage: vi.fn(),
            status: 'ready',
            error: null,
        });

        render(<AuthorChat {...defaultProps} />);
        expect(screen.getByText('Message from parts')).toBeInTheDocument();
        expect(screen.queryByText('Should not be shown')).not.toBeInTheDocument();
    });

    it('falls back to content when parts exist but contain no text parts', () => {
        (useChat as any).mockReturnValue({
            messages: [
                {
                    id: 'm3',
                    role: 'assistant',
                    content: 'Fallback when parts has no text',
                    parts: [{ type: 'tool-invocation', toolName: 'search', args: {} }],
                },
            ],
            sendMessage: vi.fn(),
            status: 'ready',
            error: null,
        });

        render(<AuthorChat {...defaultProps} />);
        expect(screen.getByText('Fallback when parts has no text')).toBeInTheDocument();
    });

    it('displays error state when error occurs', () => {
        (useChat as any).mockReturnValue({
            messages: [],
            sendMessage: vi.fn(),
            status: 'error',
            error: new Error('Failed to chat'),
        });

        render(<AuthorChat {...defaultProps} />);
        expect(screen.getByText(/Something went wrong/i)).toBeInTheDocument();
    });

    it('renders structured API error messages', () => {
        (useChat as any).mockReturnValue({
            messages: [],
            sendMessage: vi.fn(),
            status: 'error',
            error: new Error(JSON.stringify({
                error: {
                    code: 'INTERNAL_ERROR',
                    message: 'AI service is not configured.',
                },
            })),
        });

        render(<AuthorChat {...defaultProps} />);
        expect(screen.getByText('AI service is not configured.')).toBeInTheDocument();
    });

    it('renders rate limit message from structured API errors', () => {
        (useChat as any).mockReturnValue({
            messages: [],
            sendMessage: vi.fn(),
            status: 'error',
            error: new Error(JSON.stringify({
                error: {
                    code: 'RATE_LIMITED',
                    message: 'Too many requests. Please wait 20 seconds and try again.',
                },
            })),
        });

        render(<AuthorChat {...defaultProps} />);
        expect(screen.getByText('Too many requests. Please wait 20 seconds and try again.')).toBeInTheDocument();
    });
});
