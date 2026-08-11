import { render, screen, fireEvent } from '@testing-library/react';
import { renderToString } from 'react-dom/server';
import { ContentPreview } from '@/components/ui/ContentPreview';
import { READER_COVER_IMAGE_SIZES } from '@/components/ui/content-card-standards';
import { vi } from 'vitest';
import type { ContentItem } from '@/types/database';

const { mockGetProgress } = vi.hoisted(() => ({
    mockGetProgress: vi.fn(),
}));

vi.mock('@/hooks/useReadingProgress', () => ({
    useReadingProgress: () => ({
        isLoaded: true,
        isInMyList: vi.fn(() => false),
        toggleMyList: vi.fn(),
        getProgress: mockGetProgress,
    }),
}));

vi.mock('next/link', () => ({
    default: ({ children, href }: { children: React.ReactNode, href: string }) => (
        <a href={href}>{children}</a>
    ),
}));

vi.mock('next/image', () => ({
    default: ({ alt, fill, priority, unoptimized, ...props }: any) => {
        void fill;
        void priority;
        void unoptimized;
        return <img alt={alt || ''} {...props} />;
    },
}));

describe('ContentPreview', () => {
    const mockItem: ContentItem = {
        id: 'test-item-1',
        title: 'Test Title',
        author: 'Test Author',
        publish_date: null,
        source_url: null,
        duration_seconds: 600, // 10 minutes
        audio_url: null,
        embedding: null,
        created_at: '2023-01-01T00:00:00Z',
        updated_at: '',
        version: 1,
        cover_image_url: 'https://example.com/cover.jpg',
        source_id: 'test-source',
        type: 'article',
        category: 'Productivity',
        estimated_reading_time_minutes: 10,
        quick_mode_json: {
            hook: 'This is the hook.',
            key_takeaways: ['Takeaway 1', 'Takeaway 2'],
            big_idea: 'The big idea',
            rating: null,
        } as any,
        raw_content: null,
        status: 'verified',
        is_processed: true,
        processing_error: null,
    } as any;

    const defaultProps = {
        item: mockItem,
        segmentCount: 5,
        seriesContext: null,
        onSpinAgain: vi.fn(),
        isSpinning: false,
    };

    beforeEach(() => {
        vi.clearAllMocks();
        mockGetProgress.mockReturnValue(null);
    });

    it.each([
        {
            progress: null,
            label: 'Read Summary',
            href: '/read/test-item-1/test-title',
        },
        {
            progress: {
                itemId: 'test-item-1',
                completed: ['segment-1'],
                lastSegmentIndex: 0,
                lastReadAt: '2026-08-11T00:00:00.000Z',
                isCompleted: false,
            },
            label: 'Continue Reading',
            href: '/read/test-item-1/test-title',
        },
        {
            progress: {
                itemId: 'test-item-1',
                completed: ['segment-1'],
                lastSegmentIndex: 0,
                lastReadAt: '2026-08-11T00:00:00.000Z',
                isCompleted: true,
            },
            label: 'Read Again',
            href: '/read/test-item-1/test-title',
        },
    ])('uses "$label" for the desktop and mobile CTAs', ({ progress, label, href }) => {
        mockGetProgress.mockReturnValue(progress);

        render(<ContentPreview {...defaultProps} />);

        const links = screen.getAllByRole('link', { name: label });
        expect(links).toHaveLength(2);
        links.forEach((link) => expect(link).toHaveAttribute('href', href));
    });

    it('includes the mobile action rail in the initial render', () => {
        const html = renderToString(<ContentPreview {...defaultProps} />);

        expect(html).toContain('data-testid="mobile-preview-action-rail"');
        expect(html.match(/href="\/read\/test-item-1\/test-title"/g)).toHaveLength(2);
    });

    it('renders the content metadata', () => {
        render(<ContentPreview {...defaultProps} />);

        expect(screen.getByText('Test Title')).toBeInTheDocument();
        expect(screen.getByText('Test Author')).toHaveClass(
            'line-clamp-2',
            'text-balance',
            'sm:truncate'
        );
        expect(screen.getAllByText(/10\s+min read/)).toHaveLength(2);
        expect(screen.getAllByText('5 sections')).toHaveLength(2);
        expect(screen.getAllByText('article')).toHaveLength(2);
        expect(screen.getAllByText('Productivity')).toHaveLength(2);
    });

    it('shows mobile and desktop audio availability only when the content has audio', () => {
        const { rerender } = render(<ContentPreview {...defaultProps} />);

        expect(screen.queryByLabelText('Audio available')).not.toBeInTheDocument();

        rerender(
            <ContentPreview
                {...defaultProps}
                item={{ ...mockItem, audio_url: 'https://example.com/audio.mp3' }}
            />
        );

        expect(screen.getByTestId('mobile-audio-availability')).toHaveTextContent('Audio');
        expect(screen.getByTestId('desktop-audio-availability')).toHaveTextContent('Audio');
        expect(screen.getAllByLabelText('Audio available')).toHaveLength(2);
    });

    it('keeps share available in the desktop hero and mobile bottom rail', () => {
        render(<ContentPreview {...defaultProps} />);

        expect(screen.getAllByRole('button', { name: 'Share this content' })).toHaveLength(2);
    });

    it('renders quick mode hook and takeaways', () => {
        render(<ContentPreview {...defaultProps} />);

        expect(screen.getByText('This is the hook.')).toBeInTheDocument();
        expect(screen.getByText('Takeaway 1')).toBeInTheDocument();
        expect(screen.getByText('Takeaway 2')).toBeInTheDocument();
    });

    it('keeps mobile CTA clearance tied to the shared safe-area variable', () => {
        const { container } = render(<ContentPreview {...defaultProps} />);

        expect(container.firstElementChild).toHaveClass(
            'pb-[calc(5.75rem+var(--safe-area-bottom))]'
        );
        expect(document.querySelector('.safe-area-pb-sm')).toBeInTheDocument();
    });

    it('uses the shared reader cover image sizes hint', () => {
        render(<ContentPreview {...defaultProps} />);

        expect(screen.getByAltText('Test Title')).toHaveAttribute('sizes', READER_COVER_IMAGE_SIZES);
    });

    it('can initially show all takeaways when opened from Focus', () => {
        render(
            <ContentPreview
                {...defaultProps}
                initialShowAllTakeaways
                item={{
                    ...mockItem,
                    quick_mode_json: {
                        ...(mockItem.quick_mode_json as Record<string, unknown>),
                        key_takeaways: [
                            'Takeaway 1',
                            'Takeaway 2',
                            'Takeaway 3',
                            'Takeaway 4',
                            'Takeaway 5',
                        ],
                    },
                } as ContentItem}
            />
        );

        expect(screen.getByText('Takeaway 4')).toBeInTheDocument();
        expect(screen.getByText('Takeaway 5')).toBeInTheDocument();
        expect(screen.queryByRole('button', { name: /Show less/i })).not.toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Back to top' })).toBeInTheDocument();
    });

    it('replaces the reveal control with Back to top after expansion', () => {
        render(
            <ContentPreview
                {...defaultProps}
                item={{
                    ...mockItem,
                    quick_mode_json: {
                        ...(mockItem.quick_mode_json as Record<string, unknown>),
                        key_takeaways: [
                            'Takeaway 1',
                            'Takeaway 2',
                            'Takeaway 3',
                            'Takeaway 4',
                            'Takeaway 5',
                        ],
                    },
                } as ContentItem}
            />
        );

        const revealButton = screen.getByRole('button', { name: 'Show all 5 takeaways' });
        expect(revealButton).toHaveClass('min-h-11', 'sm:min-h-0');
        fireEvent.click(revealButton);

        expect(screen.queryByRole('button', { name: /Show all/i })).not.toBeInTheDocument();
        expect(screen.queryByRole('button', { name: /Show less/i })).not.toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Back to top' })).toHaveClass(
            'min-h-11',
            'sm:min-h-0'
        );
        expect(screen.getByText('Takeaway 5')).toBeInTheDocument();
    });

    it('returns focus and scroll to the preview heading from the expanded takeaways', () => {
        const scrollIntoView = vi.fn();
        Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', {
            configurable: true,
            value: scrollIntoView,
        });

        render(
            <ContentPreview
                {...defaultProps}
                initialShowAllTakeaways
                item={{
                    ...mockItem,
                    quick_mode_json: {
                        ...(mockItem.quick_mode_json as Record<string, unknown>),
                        key_takeaways: [
                            'Takeaway 1',
                            'Takeaway 2',
                            'Takeaway 3',
                            'Takeaway 4',
                            'Takeaway 5',
                        ],
                    },
                } as ContentItem}
            />
        );

        fireEvent.click(screen.getByRole('button', { name: 'Back to top' }));

        expect(screen.getByRole('heading', { name: 'Test Title' })).toHaveFocus();
        expect(scrollIntoView).toHaveBeenCalledWith({ behavior: 'smooth', block: 'start' });
    });

    it('shows exactly four takeaways without a low-value reveal toggle', () => {
        render(
            <ContentPreview
                {...defaultProps}
                item={{
                    ...mockItem,
                    quick_mode_json: {
                        ...(mockItem.quick_mode_json as Record<string, unknown>),
                        key_takeaways: [
                            'Takeaway 1',
                            'Takeaway 2',
                            'Takeaway 3',
                            'Takeaway 4',
                        ],
                    },
                } as ContentItem}
            />
        );

        expect(screen.getByText('Takeaway 4')).toBeInTheDocument();
        expect(screen.queryByRole('button', { name: /Show all 4 takeaways/i })).not.toBeInTheDocument();
    });

    it('handles the "Spin Again" interaction', () => {
        render(<ContentPreview {...defaultProps} />);

        // Spin Again is usually rendered with 'Discover Another' text
        const spinButtons = screen.getAllByText('Discover Another');
        expect(spinButtons.length).toBeGreaterThan(0);

        fireEvent.click(spinButtons[0]);
        expect(defaultProps.onSpinAgain).toHaveBeenCalledTimes(1);
    });

    it('renders series context when present', () => {
        render(
            <ContentPreview
                {...defaultProps}
                seriesContext={{
                    series: {
                        id: 'series-1',
                        slug: 'matthew',
                        title: 'Matthew',
                        description: null,
                    },
                    totalItems: 8,
                    currentOrder: 2,
                    previousItem: null,
                    nextItem: {
                        id: 'next-1',
                        title: 'Matthew 8-12',
                        series_order: 3,
                    },
                }}
            />
        );

        expect(screen.queryByText('Reading Sequence')).not.toBeInTheDocument();
        expect(screen.queryByText('Reading sequence')).not.toBeInTheDocument();
        expect(screen.getAllByText('Part 2 of 8 in Matthew').length).toBeGreaterThan(0);
        expect(screen.getByText('View All Series')).toHaveAttribute('href', '/series/matthew');
        expect(screen.getByText('Next:')).toBeInTheDocument();
        expect(screen.getAllByText('Matthew 8-12').length).toBeGreaterThan(0);
        expect(screen.getByRole('link', { name: 'Matthew 8-12' })).toHaveAttribute('href', '/preview/next-1');
        expect(screen.getByRole('link', { name: 'View all series' })).toHaveAttribute('href', '/series/matthew');
    });

    it('keeps standalone items free of series UI', () => {
        render(<ContentPreview {...defaultProps} />);

        expect(screen.queryByText(/Part \d+ of \d+/)).not.toBeInTheDocument();
        expect(screen.queryByText('Reading Sequence')).not.toBeInTheDocument();
        expect(screen.queryByText('Reading sequence')).not.toBeInTheDocument();
        expect(screen.queryByRole('link', { name: /View all/i })).not.toBeInTheDocument();
    });
});
