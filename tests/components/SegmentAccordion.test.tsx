import { act, render, screen, fireEvent } from '@testing-library/react';
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

    it('ignores keyboard navigation when there are no segments', () => {
        const onSegmentOpen = vi.fn();

        render(
            <SegmentAccordion
                {...defaultProps}
                segments={[]}
                completedSegments={new Set()}
                onSegmentOpen={onSegmentOpen}
            />
        );

        expect(() => {
            fireEvent.keyDown(window, { key: 'ArrowRight' });
            fireEvent.keyDown(window, { key: 'ArrowLeft' });
        }).not.toThrow();
        expect(onSegmentOpen).not.toHaveBeenCalled();
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

    it('labels the continue action as completing the current section', () => {
        render(<SegmentAccordion {...defaultProps} expandedSegmentId="seg-1" />);

        expect(screen.getByRole('button', { name: 'Mark complete and continue' })).toBeInTheDocument();
    });

    it('uses Finish Reading on the final section until every section is complete', () => {
        const onFinishReading = vi.fn();

        render(
            <SegmentAccordion
                {...defaultProps}
                completedSegments={new Set(['seg-2'])}
                expandedSegmentId="seg-2"
                onFinishReading={onFinishReading}
            />
        );

        fireEvent.click(screen.getByRole('button', { name: 'Finish Reading' }));

        expect(onFinishReading).toHaveBeenCalledTimes(1);
        expect(defaultProps.onSegmentComplete).not.toHaveBeenCalled();
    });

    it('supports externally controlled expanded segments', () => {
        const { container } = render(
            <SegmentAccordion
                {...defaultProps}
                expandedSegmentId="seg-2"
            />
        );

        expect(screen.getByText('Chapter 1').closest('button')).toHaveAttribute('aria-expanded', 'true');
        expect(screen.getByText('Introduction').closest('button')).toHaveAttribute('aria-expanded', 'false');
        expect(container.querySelector('.reading-copy.reading-copy-prose.reading-copy-strong')).not.toBeNull();
        expect(container.querySelector('.dark\\:prose-invert')).toBeNull();
    });

    it('uses the accordion transition scheduler for external scroll requests', async () => {
        vi.useFakeTimers();

        try {
            const scrollToSpy = vi.fn();
            window.scrollTo = scrollToSpy;

            const { container } = render(
                <SegmentAccordion
                    {...defaultProps}
                    expandedSegmentId="seg-2"
                    scrollRequest={{
                        segmentId: 'seg-2',
                        initialScrollY: 0,
                        requestId: 1,
                    }}
                />
            );

            const segmentNode = container.querySelector<HTMLElement>('[data-reader-segment-id="seg-2"]');
            expect(segmentNode).not.toBeNull();
            if (!segmentNode) {
                return;
            }

            segmentNode.getBoundingClientRect = vi.fn(() => ({
                x: 0,
                y: 240,
                top: 240,
                bottom: 440,
                left: 0,
                right: 200,
                width: 200,
                height: 200,
                toJSON: () => ({}),
            } as DOMRect));

            await act(async () => {
                await vi.advanceTimersByTimeAsync(450);
            });

            expect(scrollToSpy).toHaveBeenCalledWith({
                top: 140,
                behavior: 'smooth',
            });
        } finally {
            vi.useRealTimers();
        }
    });

    it('focuses the segment header when an external scroll request asks for focus', async () => {
        vi.useFakeTimers();

        try {
            const scrollToSpy = vi.fn();
            window.scrollTo = scrollToSpy;

            const { container } = render(
                <SegmentAccordion
                    {...defaultProps}
                    expandedSegmentId="seg-2"
                    scrollRequest={{
                        segmentId: 'seg-2',
                        initialScrollY: 0,
                        requestId: 2,
                        focusAfterScroll: true,
                    }}
                />
            );

            const segmentNode = container.querySelector<HTMLElement>('[data-reader-segment-id="seg-2"]');
            expect(segmentNode).not.toBeNull();
            if (!segmentNode) {
                return;
            }

            segmentNode.getBoundingClientRect = vi.fn(() => ({
                x: 0,
                y: 240,
                top: 240,
                bottom: 440,
                left: 0,
                right: 200,
                width: 200,
                height: 200,
                toJSON: () => ({}),
            } as DOMRect));

            await act(async () => {
                await vi.advanceTimersByTimeAsync(450);
            });

            expect(document.activeElement).toBe(screen.getByText('Chapter 1').closest('button'));
        } finally {
            vi.useRealTimers();
        }
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
                        segment: null,
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
                        segment: null,
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
                        segment: null,
                    },
                ]}
            />
        );

        fireEvent.click(screen.getByText('Introduction').closest('button')!);

        const mark = container.querySelector('mark[data-id="legacy-1"]');
        expect(mark?.textContent).toBe('Beta');
    });

    it('activates highlight details on mobile tap', () => {
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
                        segment: null,
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

    it('renders a visible narrated cue when the active audio segment is provided', () => {
        render(
            <SegmentAccordion
                {...defaultProps}
                expandedSegmentId="seg-2"
                activeNarratedSegmentId="seg-2"
            />
        );

        const activeButton = screen.getByText('Chapter 1').closest('button');
        expect(activeButton).toHaveAttribute('aria-current', 'step');
        expect(screen.getByText('Playing now')).toBeInTheDocument();
    });
});
