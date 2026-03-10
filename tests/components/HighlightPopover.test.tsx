import { render, screen, fireEvent } from '@testing-library/react';
import { HighlightPopover } from '@/components/reader/HighlightPopover';
import { vi } from 'vitest';

vi.mock('@/hooks/useHighlights', () => ({
    useUpdateHighlight: () => ({
        mutateAsync: vi.fn(),
        isPending: false,
    }),
    useDeleteHighlight: () => ({
        mutateAsync: vi.fn(),
        isPending: false,
    }),
}));

describe('HighlightPopover', () => {
    it('resets local edit state when switching to a different highlight', () => {
        const { rerender } = render(
            <HighlightPopover
                highlightId="highlight-a"
                noteBody="First note"
                highlightedText="First quote"
                currentColor="yellow"
                position={{ top: 10, left: 10, width: 20, height: 10 }}
                onClose={vi.fn()}
            />
        );

        fireEvent.click(screen.getByTitle('Edit Color or Note'));
        const textarea = screen.getByPlaceholderText('Add a note...') as HTMLTextAreaElement;
        fireEvent.change(textarea, { target: { value: 'Unsaved edit' } });

        rerender(
            <HighlightPopover
                highlightId="highlight-b"
                noteBody="Second note"
                highlightedText="Second quote"
                currentColor="blue"
                position={{ top: 10, left: 10, width: 20, height: 10 }}
                onClose={vi.fn()}
            />
        );

        expect(screen.getByText(/Second quote/)).toBeInTheDocument();
        fireEvent.click(screen.getByTitle('Edit Color or Note'));
        expect((screen.getByPlaceholderText('Add a note...') as HTMLTextAreaElement).value).toBe('Second note');
    });
});
