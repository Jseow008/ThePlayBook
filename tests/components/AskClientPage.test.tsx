import { render, screen } from '@testing-library/react';
import { AskClientPage } from '@/app/(public)/ask/client-page';
import { useChat } from '@ai-sdk/react';
import { vi } from 'vitest';

vi.mock('@ai-sdk/react', () => ({
    useChat: vi.fn(),
}));

vi.mock('next/link', () => ({
    default: ({ children, href }: { children: React.ReactNode; href: string }) => (
        <a href={href}>{children}</a>
    ),
}));

describe('AskClientPage', () => {
    beforeAll(() => {
        Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', {
            configurable: true,
            value: vi.fn(),
        });
    });

    beforeEach(() => {
        vi.clearAllMocks();
        (useChat as any).mockReturnValue({
            messages: [],
            sendMessage: vi.fn(),
            status: 'ready',
            error: null,
        });
    });

    it('renders assistant message from content when parts are undefined', () => {
        (useChat as any).mockReturnValue({
            messages: [
                {
                    id: 'm1',
                    role: 'assistant',
                    content: 'Ask page content fallback',
                },
            ],
            sendMessage: vi.fn(),
            status: 'ready',
            error: null,
        });

        render(<AskClientPage />);
        expect(screen.getByText('Ask page content fallback')).toBeInTheDocument();
    });

    it('prefers text assembled from parts over content', () => {
        (useChat as any).mockReturnValue({
            messages: [
                {
                    id: 'm2',
                    role: 'assistant',
                    content: 'Should not be shown',
                    parts: [
                        { type: 'text', text: 'Ask page ' },
                        { type: 'text', text: 'parts text' },
                    ],
                },
            ],
            sendMessage: vi.fn(),
            status: 'ready',
            error: null,
        });

        render(<AskClientPage />);
        expect(screen.getByText('Ask page parts text')).toBeInTheDocument();
        expect(screen.queryByText('Should not be shown')).not.toBeInTheDocument();
    });

    it('falls back to content when parts exist but contain no text parts', () => {
        (useChat as any).mockReturnValue({
            messages: [
                {
                    id: 'm3',
                    role: 'assistant',
                    content: 'Fallback for non-text parts',
                    parts: [{ type: 'tool-invocation', toolName: 'search', args: {} }],
                },
            ],
            sendMessage: vi.fn(),
            status: 'ready',
            error: null,
        });

        render(<AskClientPage />);
        expect(screen.getByText('Fallback for non-text parts')).toBeInTheDocument();
    });
});
