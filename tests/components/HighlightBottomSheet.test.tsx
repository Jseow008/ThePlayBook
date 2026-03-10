import { render, screen } from '@testing-library/react';
import { HighlightBottomSheet } from '@/components/reader/HighlightBottomSheet';
import { vi } from 'vitest';

describe('HighlightBottomSheet', () => {
    it('renders a mobile view-only highlight sheet', () => {
        render(
            <HighlightBottomSheet
                noteBody="Mobile note"
                highlightedText="Mobile quote"
                currentColor="green"
                createdAt="2026-03-10T00:00:00.000Z"
                onClose={vi.fn()}
            />
        );

        expect(screen.getByText(/Mobile quote/)).toBeInTheDocument();
        expect(screen.getByText('Mobile note')).toBeInTheDocument();
        expect(screen.queryByText('Save Changes')).not.toBeInTheDocument();
        expect(screen.queryByText('Edit Highlight')).not.toBeInTheDocument();
    });
});
