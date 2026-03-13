import { render, screen, waitFor } from '@testing-library/react';
import { ReaderView } from '@/components/reader/ReaderView';
import { vi } from 'vitest';
import type { ContentItemWithSegments } from '@/types/domain';

const {
    notesDrawerSpy,
    routerReplaceMock,
    searchParamsState,
    highlightsState,
    syncFromCloudMock,
} = vi.hoisted(() => ({
    notesDrawerSpy: vi.fn(),
    routerReplaceMock: vi.fn(),
    searchParamsState: { value: '' },
    highlightsState: {
        value: [] as Array<{
            id: string;
            user_id: string;
            content_item_id: string;
            segment_id: string | null;
            highlighted_text: string;
            note_body: string | null;
            color: string | null;
            anchor_start: number | null;
            anchor_end: number | null;
            created_at: string | null;
            updated_at: string | null;
            content_item: null;
            segment: null;
        }>,
    },
    syncFromCloudMock: vi.fn(),
}));

vi.mock('next/navigation', () => ({
    usePathname: () => '/read/test-item-1',
    useRouter: () => ({ replace: routerReplaceMock }),
    useSearchParams: () => new URLSearchParams(searchParamsState.value),
}));

// Mock child components to isolate ReaderView testing
vi.mock('@/components/reader/ReaderHeroHeader', () => ({
    ReaderHeroHeader: () => <div data-testid="mock-hero-header" />
}));

vi.mock('@/components/reader/SegmentAccordion', () => ({
    SegmentAccordion: () => <div data-testid="mock-segment-accordion" />
}));

vi.mock('@/components/reader/NotesDrawer', () => ({
    NotesDrawer: (props: any) => {
        notesDrawerSpy(props);
        return <div data-testid="mock-notes-drawer" />;
    }
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
        getProgress: vi.fn(() => null),
        isLoaded: true,
    }),
}));

vi.mock('@/hooks/useReadingTimer', () => ({
    useReadingTimer: vi.fn(),
}));

vi.mock('@/hooks/useHighlights', () => ({
    useHighlights: () => ({
        data: highlightsState.value,
        isLoading: false,
        error: null,
    }),
}));

vi.mock('@/hooks/useReaderSettings', () => ({
    useReaderSettings: () => ({
        readerTheme: 'light',
        fontFamily: 'sans',
        fontSize: 'medium',
        lineHeight: 'default',
        syncFromCloud: syncFromCloudMock,
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
        vi.clearAllMocks();
        notesDrawerSpy.mockClear();
        routerReplaceMock.mockClear();
        searchParamsState.value = '';
        highlightsState.value = [];
        window.scrollTo = vi.fn();
        localStorage.clear();
        document.body.innerHTML = '';
        syncFromCloudMock.mockClear();
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

    it('does not resync reader settings on mount or remount', () => {
        const { rerender, unmount } = render(<ReaderView content={mockContent} />);

        expect(syncFromCloudMock).not.toHaveBeenCalled();

        rerender(<ReaderView content={mockContent} />);
        expect(syncFromCloudMock).not.toHaveBeenCalled();

        unmount();
        render(<ReaderView content={mockContent} />);
        expect(syncFromCloudMock).not.toHaveBeenCalled();
    });

    it('passes the current reader state into NotesDrawer', async () => {
        render(<ReaderView content={mockContent} />);

        await waitFor(() => {
            expect(notesDrawerSpy).toHaveBeenCalledWith(
                expect.objectContaining({
                    highlights: [],
                    isLoading: false,
                    hasError: false,
                    activeHighlightId: null,
                    onHighlightJump: expect.any(Function),
                    sections: [
                        {
                            id: 'seg-1',
                            title: 'Segment 1',
                        },
                    ],
                })
            );
        });
    });

    it('consumes a highlightId URL param and clears it after jumping', async () => {
        searchParamsState.value = 'highlightId=highlight-1';
        highlightsState.value = [
            {
                id: 'highlight-1',
                user_id: 'user-1',
                content_item_id: 'test-item-1',
                segment_id: 'seg-1',
                highlighted_text: 'Body 1',
                note_body: null,
                color: 'yellow',
                anchor_start: 0,
                anchor_end: 6,
                created_at: '2026-03-11T12:00:00.000Z',
                updated_at: null,
                content_item: null,
                segment: null,
            },
        ];

        const mark = document.createElement('mark');
        mark.setAttribute('data-id', 'highlight-1');
        mark.textContent = 'Body 1';
        document.body.appendChild(mark);

        render(<ReaderView content={mockContent} />);

        await waitFor(() => {
            expect(notesDrawerSpy).toHaveBeenCalledWith(
                expect.objectContaining({
                    activeHighlightId: 'highlight-1',
                })
            );
        });

        await waitFor(() => {
            expect(routerReplaceMock).toHaveBeenCalledWith('/read/test-item-1', { scroll: false });
        });
    });
});
