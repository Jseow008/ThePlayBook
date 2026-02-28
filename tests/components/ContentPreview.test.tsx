import { render, screen, fireEvent } from '@testing-library/react';
import { ContentPreview } from '@/components/ui/ContentPreview';
import { vi } from 'vitest';
import type { ContentItem } from '@/types/database';

vi.mock('@/hooks/useReadingProgress', () => ({
    useReadingProgress: () => ({
        isInMyList: vi.fn(() => false),
        toggleMyList: vi.fn(),
    }),
}));

vi.mock('next/link', () => ({
    default: ({ children, href }: { children: React.ReactNode, href: string }) => (
        <a href={href}>{children}</a>
    ),
}));

vi.mock('next/image', () => ({
    default: (props: any) => <img alt={props.alt || ''} {...props} />,
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
        created_at: '',
        updated_at: '',
        version: 1,
        cover_image_url: 'https://example.com/cover.jpg',
        source_id: 'test-source',
        type: 'article',
        category: null,
        estimated_reading_time_minutes: 10,
        quick_mode_json: {
            hook: 'This is the hook.',
            key_takeaways: ['Takeaway 1', 'Takeaway 2'],
            big_idea: 'The big idea',
            rating: null,
        } as any,
        raw_content: null,
        status: 'published',
        is_processed: true,
        processing_error: null,
    };

    const defaultProps = {
        item: mockItem,
        segmentCount: 5,
        onSpinAgain: vi.fn(),
        isSpinning: false,
    };

    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('renders the content metadata', () => {
        render(<ContentPreview {...defaultProps} />);

        expect(screen.getByText('Test Title')).toBeInTheDocument();
        expect(screen.getByText('Test Author')).toBeInTheDocument();
        expect(screen.getByText('10 min')).toBeInTheDocument();
        expect(screen.getByText('5 sections')).toBeInTheDocument();
        expect(screen.getByText('article')).toBeInTheDocument();
    });

    it('renders quick mode hook and takeaways', () => {
        render(<ContentPreview {...defaultProps} />);

        expect(screen.getByText('This is the hook.')).toBeInTheDocument();
        expect(screen.getByText('Takeaway 1')).toBeInTheDocument();
        expect(screen.getByText('Takeaway 2')).toBeInTheDocument();
    });

    it('handles the "Spin Again" interaction', () => {
        render(<ContentPreview {...defaultProps} />);

        // Spin Again is usually rendered with 'Discover Another' text
        const spinButtons = screen.getAllByText('Discover Another');
        expect(spinButtons.length).toBeGreaterThan(0);

        fireEvent.click(spinButtons[0]);
        expect(defaultProps.onSpinAgain).toHaveBeenCalledTimes(1);
    });
});
