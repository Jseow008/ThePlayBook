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
});
