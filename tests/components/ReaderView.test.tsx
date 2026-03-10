import { render, screen, waitFor } from '@testing-library/react';
import { ReaderView } from '@/components/reader/ReaderView';
import { vi } from 'vitest';
import type { ContentItemWithSegments } from '@/types/domain';

const mockSaveReadingProgress = vi.fn();
const mockSyncFromCloud = vi.fn();
const mockReaderHeroHeader = vi.fn(
    ({ segmentsRead, segmentsTotal }: { segmentsRead: number; segmentsTotal: number }) => (
        <div
            data-testid="mock-hero-header"
            data-segments-read={segmentsRead}
            data-segments-total={segmentsTotal}
        />
    )
);

vi.mock('@/components/reader/ReaderHeroHeader', () => ({
    ReaderHeroHeader: (props: { segmentsRead: number; segmentsTotal: number }) => mockReaderHeroHeader(props),
}));

vi.mock('@/components/reader/SegmentAccordion', () => ({
    SegmentAccordion: () => <div data-testid="mock-segment-accordion" />,
}));

vi.mock('@/components/reader/NotesDrawer', () => ({
    NotesDrawer: () => <div data-testid="mock-notes-drawer" />,
}));

vi.mock('@/components/reader/TextSelectionToolbar', () => ({
    TextSelectionToolbar: () => <div data-testid="mock-text-toolbar" />,
}));

vi.mock('@/components/ui/ContentFeedback', () => ({
    ContentFeedback: () => <div data-testid="mock-content-feedback" />,
}));

vi.mock('@/components/reader/CompletionCard', () => ({
    CompletionCard: () => <div data-testid="mock-completion-card" />,
}));

vi.mock('@/hooks/useReadingProgress', () => ({
    useReadingProgress: () => ({
        saveReadingProgress: mockSaveReadingProgress,
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
        syncFromCloud: mockSyncFromCloud,
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
        embedding: null,
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
        vi.restoreAllMocks();
        vi.clearAllMocks();
        localStorage.clear();
    });

    it('renders the layout components including header, accordion, and drawers', () => {
        render(<ReaderView content={mockContent} />);

        expect(screen.getByTestId('mock-hero-header')).toBeInTheDocument();
        expect(screen.getByTestId('mock-segment-accordion')).toBeInTheDocument();
        expect(screen.getByTestId('mock-notes-drawer')).toBeInTheDocument();
        expect(screen.getByTestId('mock-text-toolbar')).toBeInTheDocument();
        expect(screen.getByTestId('mock-content-feedback')).toBeInTheDocument();
    });

    it('renders the big idea if available', () => {
        render(<ReaderView content={mockContent} />);

        expect(screen.getByText('The giant idea')).toBeInTheDocument();
        expect(screen.getByText('The Big Idea')).toBeInTheDocument();
    });

    it('normalizes stale saved progress and persists the cleaned payload', async () => {
        const savedProgress = JSON.stringify({
            itemId: 'test-item-1',
            completed: ['seg-1', 'stale-seg', 'seg-1'],
            lastSegmentIndex: 99,
            maxSegmentIndex: 99,
            lastReadAt: '2026-03-10T00:00:00.000Z',
            isCompleted: false,
            totalSegments: 99,
        });
        vi.spyOn(window.localStorage, 'getItem').mockImplementation((key: string) => {
            if (key === 'flux_progress_test-item-1') {
                return savedProgress;
            }

            return null;
        });

        render(<ReaderView content={mockContent} />);

        await waitFor(() => {
            expect(mockSaveReadingProgress).toHaveBeenCalledWith(
                'test-item-1',
                expect.objectContaining({
                    completed: ['seg-1'],
                    lastSegmentIndex: 0,
                    maxSegmentIndex: 0,
                    totalSegments: 1,
                    isCompleted: true,
                }),
            );
        }, { timeout: 2000 });
    });

    it('resets progress state when navigating to a new content item with no saved progress', async () => {
        const nextContent: ContentItemWithSegments = {
            ...mockContent,
            id: 'test-item-2',
            title: 'Next Title',
            quick_mode_json: null,
            segments: [
                {
                    id: 'seg-2',
                    item_id: 'item-2',
                    order_index: 0,
                    title: 'Segment 2',
                    markdown_body: 'Body 2',
                    start_time_sec: null,
                    end_time_sec: null,
                },
            ],
        } as any;

        localStorage.setItem('flux_progress_test-item-1', JSON.stringify({
            itemId: 'test-item-1',
            completed: ['seg-1'],
            lastSegmentIndex: 0,
            maxSegmentIndex: 0,
            lastReadAt: '2026-03-10T00:00:00.000Z',
            isCompleted: true,
            totalSegments: 1,
        }));

        const { rerender } = render(<ReaderView content={mockContent} />);

        mockSaveReadingProgress.mockClear();

        rerender(<ReaderView content={nextContent} />);

        await waitFor(() => {
            expect(mockSaveReadingProgress).toHaveBeenCalledWith(
                'test-item-2',
                expect.objectContaining({
                    completed: [],
                    lastSegmentIndex: -1,
                    maxSegmentIndex: -1,
                    totalSegments: 1,
                    isCompleted: false,
                }),
            );
            expect(screen.getByTestId('mock-content-feedback')).toBeInTheDocument();
        }, { timeout: 2000 });
    });
});
