import { render, screen, fireEvent } from '@testing-library/react';
import { SegmentAccordion } from '@/components/reader/SegmentAccordion';
import { vi } from 'vitest';
import type { SegmentFull } from '@/types/domain';

// Mock matchMedia and other hooks to avoid rendering complex nested context hooks
vi.mock('@/hooks/useReaderSettings', () => ({
    useReaderSettings: () => ({
        fontSize: 'medium',
        fontFamily: 'sans',
        lineHeight: 'default',
    }),
}));

vi.mock('@/hooks/useMediaQuery', () => ({
    useMediaQuery: vi.fn(() => true), // default to desktop for tests
}));

describe('SegmentAccordion', () => {
    const mockSegments: SegmentFull[] = [
        {
            id: 'seg-1',
            item_id: 'item-1',
            order_index: 0,
            title: 'Introduction',
            markdown_body: 'This is the body of the first segment.',
            start_time_sec: null,
            end_time_sec: null,
            created_at: '',
            updated_at: '',
            deleted_at: null,
            version: 1,
            word_count: 8,
            status: 'published',
            is_processed: true,
            processing_error: null
        },
        {
            id: 'seg-2',
            item_id: 'item-1',
            order_index: 1,
            title: 'Chapter 1',
            markdown_body: 'The real meat of the content.',
            start_time_sec: null,
            end_time_sec: null,
            created_at: '',
            updated_at: '',
            deleted_at: null,
            version: 1,
            word_count: 6,
            status: 'published',
            is_processed: true,
            processing_error: null
        },
    ];

    const defaultProps = {
        segments: mockSegments,
        completedSegments: new Set(['seg-1']),
        onSegmentOpen: vi.fn(),
        onSegmentComplete: vi.fn(),
        highlights: [],
    };

    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('renders all segment titles', () => {
        render(<SegmentAccordion {...defaultProps} />);
        expect(screen.getByText('Introduction')).toBeInTheDocument();
        expect(screen.getByText('Chapter 1')).toBeInTheDocument();
    });

    it('marks completed segments', () => {
        render(<SegmentAccordion {...defaultProps} />);

        // Since the first segment is marked complete (seg-1), we check for the CheckCircle2 icon
        // CheckCircle2 is rendered for completed. Because it's an SVG, we can check by looking
        // at the classes or specific properties. The simplest way is verifying if the completion badge is green.
        const firstSegmentBadge = screen.getByText('Introduction').closest('button')?.querySelector('.text-green-400, .bg-green-500\\/15');
        expect(firstSegmentBadge).not.toBeNull();

        // Second segment is not complete, it should show its padded index number '02'
        expect(screen.getByText('02')).toBeInTheDocument();
    });

    it('calls onSegmentOpen when a segment is clicked', () => {
        render(<SegmentAccordion {...defaultProps} />);
        const firstSegment = screen.getByText('Introduction').closest('button');
        fireEvent.click(firstSegment!);

        expect(defaultProps.onSegmentOpen).toHaveBeenCalledWith('seg-1', 0);
    });
});
