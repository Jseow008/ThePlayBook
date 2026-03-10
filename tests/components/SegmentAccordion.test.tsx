import { render, screen, fireEvent } from '@testing-library/react';
import { SegmentAccordion } from '@/components/reader/SegmentAccordion';
import { useMediaQuery } from '@/hooks/useMediaQuery';
import { vi } from 'vitest';
import type { SegmentFull } from '@/types/domain';

vi.mock('@/hooks/useReaderSettings', () => ({
    useReaderSettings: () => ({
        fontSize: 'medium',
        fontFamily: 'sans',
        lineHeight: 'default',
    }),
}));

vi.mock('@/hooks/useMediaQuery', () => ({
    useMediaQuery: vi.fn(() => true),
}));

describe('SegmentAccordion', () => {
    const mockedUseMediaQuery = vi.mocked(useMediaQuery);

    const mockSegments: SegmentFull[] = [
        {
            id: 'seg-1',
            item_id: 'item-1',
            order_index: 0,
            title: 'Introduction',
            markdown_body: 'Alpha Beta Alpha',
            start_time_sec: null,
            end_time_sec: null,
        },
        {
            id: 'seg-2',
            item_id: 'item-1',
            order_index: 1,
            title: 'Chapter 1',
            markdown_body: 'Alpha **Beta** Gamma',
            start_time_sec: null,
            end_time_sec: null,
        },
    ];

    const defaultProps = {
        segments: mockSegments,
        completedSegments: new Set(['seg-1']),
        onSegmentOpen: vi.fn(),
        onSegmentComplete: vi.fn(),
        onHighlightActivate: vi.fn(),
        highlights: [],
    };

    beforeEach(() => {
        vi.clearAllMocks();
        mockedUseMediaQuery.mockReturnValue(true);
        window.scrollTo = vi.fn();
    });

    it('renders all segment titles', () => {
        render(<SegmentAccordion {...defaultProps} />);
        expect(screen.getByText('Introduction')).toBeInTheDocument();
        expect(screen.getByText('Chapter 1')).toBeInTheDocument();
    });

    it('marks completed segments', () => {
        render(<SegmentAccordion {...defaultProps} />);

        const firstSegmentBadge = screen.getByText('Introduction').closest('button')?.querySelector('.text-green-400, .bg-green-500\\/15');
        expect(firstSegmentBadge).not.toBeNull();
        expect(screen.getByText('02')).toBeInTheDocument();
    });

    it('calls onSegmentOpen when a segment is clicked', () => {
        render(<SegmentAccordion {...defaultProps} />);
        const firstSegment = screen.getByText('Introduction').closest('button');
        fireEvent.click(firstSegment!);

        expect(defaultProps.onSegmentOpen).toHaveBeenCalledWith('seg-1', 0);
    });

    it('renders anchored highlights against the correct repeated text occurrence', () => {
        const { container } = render(
            <SegmentAccordion
                {...defaultProps}
                highlights={[
                    {
                        id: 'highlight-1',
                        user_id: 'user-1',
                        content_item_id: 'item-1',
                        segment_id: 'seg-1',
                        highlighted_text: 'Alpha',
                        note_body: null,
                        color: 'yellow',
                        anchor_start: 11,
                        anchor_end: 16,
                        created_at: '2026-03-10T00:00:00.000Z',
                        updated_at: null,
                        content_item: null,
                    },
                ]}
            />
        );

        fireEvent.click(screen.getByText('Introduction').closest('button')!);

        const mark = container.querySelector('mark[data-id="highlight-1"]');
        expect(mark).not.toBeNull();
        expect(mark?.textContent).toBe('Alpha');

        const paragraphHtml = container.querySelector('[data-segment-id="seg-1"] p')?.innerHTML ?? '';
        expect(paragraphHtml).toMatch(/Alpha Beta <mark[^>]*>Alpha<\/mark>/);
    });

    it('renders anchor-based highlights across markdown node boundaries', () => {
        const { container } = render(
            <SegmentAccordion
                {...defaultProps}
                highlights={[
                    {
                        id: 'highlight-2',
                        user_id: 'user-1',
                        content_item_id: 'item-1',
                        segment_id: 'seg-2',
                        highlighted_text: 'Beta Gamma',
                        note_body: 'Cross-node',
                        color: 'blue',
                        anchor_start: 6,
                        anchor_end: 16,
                        created_at: '2026-03-10T00:00:00.000Z',
                        updated_at: null,
                        content_item: null,
                    },
                ]}
            />
        );

        fireEvent.click(screen.getByText('Chapter 1').closest('button')!);

        const marks = Array.from(container.querySelectorAll('mark[data-id="highlight-2"]'));
        expect(marks).toHaveLength(2);
        expect(marks.map((mark) => mark.textContent).join('')).toBe('Beta Gamma');
    });

    it('falls back to legacy text matching when anchors are absent', () => {
        const { container } = render(
            <SegmentAccordion
                {...defaultProps}
                highlights={[
                    {
                        id: 'legacy-1',
                        user_id: 'user-1',
                        content_item_id: 'item-1',
                        segment_id: 'seg-1',
                        highlighted_text: 'Beta',
                        note_body: null,
                        color: 'yellow',
                        anchor_start: null,
                        anchor_end: null,
                        created_at: '2026-03-10T00:00:00.000Z',
                        updated_at: null,
                        content_item: null,
                    },
                ]}
            />
        );

        fireEvent.click(screen.getByText('Introduction').closest('button')!);

        const mark = container.querySelector('mark[data-id="legacy-1"]');
        expect(mark?.textContent).toBe('Beta');
    });

    it('activates mobile highlight details on tap', () => {
        mockedUseMediaQuery.mockReturnValue(false);

        const onHighlightActivate = vi.fn();
        const { container } = render(
            <SegmentAccordion
                {...defaultProps}
                onHighlightActivate={onHighlightActivate}
                highlights={[
                    {
                        id: 'highlight-3',
                        user_id: 'user-1',
                        content_item_id: 'item-1',
                        segment_id: 'seg-1',
                        highlighted_text: 'Alpha',
                        note_body: null,
                        color: 'yellow',
                        anchor_start: 0,
                        anchor_end: 5,
                        created_at: '2026-03-10T00:00:00.000Z',
                        updated_at: null,
                        content_item: null,
                    },
                ]}
            />
        );

        fireEvent.click(screen.getByText('Introduction').closest('button')!);
        fireEvent.click(container.querySelector('mark[data-id="highlight-3"]')!);

        expect(onHighlightActivate).toHaveBeenCalledWith(
            'highlight-3',
            expect.objectContaining({
                top: expect.any(Number),
                left: expect.any(Number),
                width: expect.any(Number),
                height: expect.any(Number),
            })
        );
    });
});
