import { render, screen } from '@testing-library/react';
import { ReaderView } from '@/components/reader/ReaderView';
import { vi } from 'vitest';
import type { ContentItemWithSegments } from '@/types/domain';

// Mock child components to isolate ReaderView testing
vi.mock('@/components/reader/ReaderHeroHeader', () => ({
    ReaderHeroHeader: () => <div data-testid="mock-hero-header" />
}));

vi.mock('@/components/reader/SegmentAccordion', () => ({
    SegmentAccordion: () => <div data-testid="mock-segment-accordion" />
}));

vi.mock('@/components/reader/NotesDrawer', () => ({
    NotesDrawer: () => <div data-testid="mock-notes-drawer" />
}));

vi.mock('@/components/reader/TextSelectionToolbar', () => ({
    TextSelectionToolbar: () => <div data-testid="mock-text-toolbar" />
}));

vi.mock('@/components/ui/ContentFeedback', () => ({
    ContentFeedback: () => <div data-testid="mock-content-feedback" />
}));

vi.mock('@/components/reader/CompletionCard', () => ({
    CompletionCard: () => <div data-testid="mock-completion-card" />
}));

vi.mock('@/hooks/useReadingProgress', () => ({
    useReadingProgress: () => ({
        saveReadingProgress: vi.fn(),
    }),
}));

vi.mock('@/hooks/useReadingTimer', () => ({
    useReadingTimer: vi.fn(),
}));

vi.mock('@/hooks/useHighlights', () => ({
    useHighlights: () => ({ data: [] }),
}));

vi.mock('@/hooks/useReaderSettings', () => ({
    useReaderSettings: () => ({
        readerTheme: 'light',
        fontFamily: 'sans',
        fontSize: 'medium',
        lineHeight: 'default',
        syncFromCloud: vi.fn(),
    }),
}));

vi.mock('@/hooks/useMediaQuery', () => ({
    useMediaQuery: vi.fn(() => true),
}));

describe('ReaderView', () => {
    const mockContent: ContentItemWithSegments = {
        id: 'test-item-1',
        title: 'Test Title',
        author: 'Test Author',
        type: 'article',
        duration_seconds: 600,
        cover_image_url: 'https://example.com/cover.jpg',
        created_at: '',
        updated_at: '',
        version: 1,
        source_id: 'src1',
        audio_url: null,
        estimated_reading_time_minutes: 10,
        quick_mode_json: { big_idea: 'The giant idea' } as any,
        publish_date: null,
        source_url: null,
        category: null,
        status: 'published',
        is_processed: true,
        processing_error: null,
        raw_content: null,
        segments: [
            {
                id: 'seg-1',
                item_id: 'item-1',
                order_index: 0,
                title: 'Segment 1',
                markdown_body: 'Body 1',
                start_time_sec: null,
                end_time_sec: null,
            },
        ],
    } as any;

    beforeEach(() => {
        vi.clearAllMocks();
        localStorage.clear();
    });

    it('renders the layout components including header, accordion, and drawers', () => {
        render(<ReaderView content={mockContent} />);

        expect(screen.getByTestId('mock-hero-header')).toBeInTheDocument();
        expect(screen.getByTestId('mock-segment-accordion')).toBeInTheDocument();
        expect(screen.getByTestId('mock-notes-drawer')).toBeInTheDocument();
        expect(screen.getByTestId('mock-text-toolbar')).toBeInTheDocument();

        // Before completion, displays feedback form
        expect(screen.getByTestId('mock-content-feedback')).toBeInTheDocument();
    });

    it('renders the big idea if available', () => {
        render(<ReaderView content={mockContent} />);
        expect(screen.getByText('The giant idea')).toBeInTheDocument();
        expect(screen.getByText('The Big Idea')).toBeInTheDocument();
    });
});
