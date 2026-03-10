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
    const createPortalContainer = () => {
        const container = document.createElement('div');
        container.className = 'reader-sepia';
        document.body.appendChild(container);
        return container;
    };

    it('resets local edit state when switching to a different highlight', () => {
        const portalContainer = createPortalContainer();
        const { rerender } = render(
            <HighlightPopover
                highlightId="highlight-a"
                noteBody="First note"
                highlightedText="First quote"
                currentColor="yellow"
                position={{ top: 10, left: 10, width: 20, height: 10 }}
                portalContainer={portalContainer}
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
                portalContainer={portalContainer}
                onClose={vi.fn()}
            />
        );

        expect(screen.getByText(/Second quote/)).toBeInTheDocument();
        fireEvent.click(screen.getByTitle('Edit Color or Note'));
        expect((screen.getByPlaceholderText('Add a note...') as HTMLTextAreaElement).value).toBe('Second note');
    });

    it('renders solid color swatches and updates the selected swatch state', () => {
        const portalContainer = createPortalContainer();
        render(
            <HighlightPopover
                highlightId="highlight-c"
                noteBody="Color note"
                highlightedText="Color quote"
                currentColor="red"
                position={{ top: 10, left: 10, width: 20, height: 10 }}
                portalContainer={portalContainer}
                onClose={vi.fn()}
            />
        );

        fireEvent.click(screen.getByTitle('Edit Color or Note'));

        const redButton = screen.getByLabelText('Set color to red');
        const blueButton = screen.getByLabelText('Set color to blue');

        expect(redButton.className).toContain('bg-highlight-swatch-red');
        expect(blueButton.className).toContain('bg-highlight-swatch-blue');
        expect(redButton.className).toContain('ring-2');
        expect(blueButton.className).not.toContain('ring-2');

        fireEvent.click(blueButton);

        expect(blueButton.className).toContain('ring-2');
        expect(redButton.className).not.toContain('ring-2');
    });
});
