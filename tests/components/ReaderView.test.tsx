import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { ReaderView } from '@/components/reader/ReaderView';
import { vi } from 'vitest';
import type { ContentItemWithSegments } from '@/types/domain';
import { audioResumeKey } from '@/lib/local-user-storage';
import { useMediaQuery } from '@/hooks/useMediaQuery';

const {
    localStorageState,
    notesDrawerSpy,
    progressState,
    readerHeroHeaderSpy,
    removeFromProgressMock,
    routerReplaceMock,
    saveReadingProgressMock,
    searchParamsState,
    segmentAccordionSpy,
    storageScopeState,
    highlightsState,
    useHighlightsSpy,
    syncFromCloudMock,
    toastSuccessMock,
} = vi.hoisted(() => ({
    localStorageState: new Map<string, string>(),
    notesDrawerSpy: vi.fn(),
    progressState: {
        value: null as { completed?: string[]; maxSegmentIndex?: number; lastSegmentIndex?: number } | null,
    },
    readerHeroHeaderSpy: vi.fn(),
    removeFromProgressMock: vi.fn(),
    routerReplaceMock: vi.fn(),
    saveReadingProgressMock: vi.fn(),
    searchParamsState: { value: '' },
    segmentAccordionSpy: vi.fn(),
    storageScopeState: { value: 'guest' },
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
    useHighlightsSpy: vi.fn(),
    syncFromCloudMock: vi.fn(),
    toastSuccessMock: vi.fn(),
}));

vi.mock('next/navigation', () => ({
    usePathname: () => '/read/test-item-1',
    useRouter: () => ({ replace: routerReplaceMock }),
    useSearchParams: () => new URLSearchParams(searchParamsState.value),
}));

vi.mock('next/link', () => ({
    default: ({ children, href, className }: { children: React.ReactNode; href: string; className?: string }) => (
        <a href={href} className={className}>
            {children}
        </a>
    ),
}));

vi.mock('sonner', () => ({
    toast: {
        success: toastSuccessMock,
    },
}));

// Mock child components to isolate ReaderView testing
vi.mock('@/components/reader/ReaderHeroHeader', () => ({
    ReaderHeroHeader: (props: any) => {
        readerHeroHeaderSpy(props);
        return (
            <div data-testid="mock-hero-header">
                <button
                    data-testid="sync-audio-seg-1"
                    onClick={() => {
                        props.onAudioPlaybackStateChange?.(true);
                        props.onAudioTimeChange?.(5, { durationSec: 90, isEnded: false });
                    }}
                />
                <button
                    data-testid="sync-audio-seg-2"
                    onClick={() => {
                        props.onAudioPlaybackStateChange?.(true);
                        props.onAudioTimeChange?.(35, { durationSec: 90, isEnded: false });
                    }}
                />
                <button
                    data-testid="sync-audio-seg-3"
                    onClick={() => {
                        props.onAudioPlaybackStateChange?.(true);
                        props.onAudioTimeChange?.(65, { durationSec: 90, isEnded: false });
                    }}
                />
                <button
                    data-testid="sync-audio-ended"
                    onClick={() => {
                        props.onAudioPlaybackStateChange?.(false);
                        props.onAudioTimeChange?.(90, { durationSec: 90, isEnded: true });
                    }}
                />
                <button
                    data-testid="sync-audio-ended-short"
                    onClick={() => {
                        props.onAudioPlaybackStateChange?.(false);
                        props.onAudioTimeChange?.(89.4, { durationSec: 90, isEnded: true });
                    }}
                />
                <button data-testid="pause-audio" onClick={() => props.onAudioPlaybackStateChange?.(false)} />
                <button data-testid="resume-audio-follow" onClick={() => props.onResumeAudioFollow?.()} />
            </div>
        );
    }
}));

vi.mock('@/components/reader/SegmentAccordion', () => ({
    SegmentAccordion: (props: any) => {
        segmentAccordionSpy(props);
        return (
            <div>
                <div data-testid="mock-segment-accordion">{props.expandedSegmentId ?? 'none'}</div>
                <div data-testid="mock-active-audio-segment">{props.activeNarratedSegmentId ?? 'none'}</div>
                {props.segments?.map((segment: { id: string }) => (
                    <div key={segment.id} data-reader-segment-id={segment.id} />
                ))}
                <button
                    data-testid="manual-open-seg-1"
                    onClick={() => {
                        props.onExpandedSegmentChange?.('seg-1');
                        props.onSegmentOpen?.('seg-1', 0);
                    }}
                />
                <button
                    data-testid="manual-open-seg-2"
                    onClick={() => {
                        props.onExpandedSegmentChange?.('seg-2');
                        props.onSegmentOpen?.('seg-2', 1);
                    }}
                />
                <button
                    data-testid="manual-complete-seg-1"
                    onClick={() => props.onSegmentComplete?.('seg-1', 0)}
                />
                <button
                    data-testid="manual-complete-seg-2"
                    onClick={() => props.onSegmentComplete?.('seg-2', 1)}
                />
                <button
                    data-testid="activate-highlight"
                    onClick={() => props.onHighlightActivate?.('highlight-1', {
                        top: 12,
                        left: 34,
                        width: 56,
                        height: 18,
                    })}
                />
                <button
                    data-testid="finish-reading"
                    onClick={() => props.onFinishReading?.()}
                />
            </div>
        );
    }
}));

vi.mock('@/components/reader/NotesDrawer', () => ({
    NotesDrawer: (props: any) => {
        notesDrawerSpy(props);
        return <div data-testid="mock-notes-drawer">{props.isOpen ? 'open' : 'closed'}</div>;
    }
}));

vi.mock('@/components/reader/TextSelectionToolbar', () => ({
    TextSelectionToolbar: () => <div data-testid="mock-text-toolbar" />
}));

vi.mock('@/components/reader/MobileSelectionActions', () => ({
    MobileSelectionActions: () => <div data-testid="mock-mobile-selection-actions" />
}));

vi.mock('@/components/ui/ContentFeedback', () => ({
    ContentFeedback: () => <div data-testid="mock-content-feedback" />
}));

vi.mock('@/components/reader/CompletionCard', () => ({
    CompletionCard: () => <div data-testid="mock-completion-card" />
}));

vi.mock('@/components/reader/AuthorChat', () => ({
    AuthorChat: (props: any) => (
        <div data-testid="mock-author-chat">
            <div>{props.authorName}</div>
            <div>{props.hasCompletedReading ? 'completed-chat' : 'in-progress-chat'}</div>
            <button data-testid="close-author-chat" onClick={props.onClose} />
        </div>
    ),
}));

vi.mock('@/hooks/useReadingProgress', () => ({
    useReadingProgress: () => ({
        saveReadingProgress: saveReadingProgressMock,
        removeFromProgress: removeFromProgressMock,
        getProgress: vi.fn(() => progressState.value),
        isLoaded: true,
        storageScope: storageScopeState.value,
    }),
}));

vi.mock('@/hooks/useReadingTimer', () => ({
    useReadingTimer: vi.fn(() => ({
        formattedTime: '0:00',
    })),
}));

vi.mock('@/hooks/useHighlights', () => ({
    useHighlights: (...args: unknown[]) => {
        useHighlightsSpy(...args);
        return {
            data: highlightsState.value,
            isLoading: false,
            error: null,
        };
    },
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
        removeFromProgressMock.mockClear();
        progressState.value = null;
        readerHeroHeaderSpy.mockClear();
        routerReplaceMock.mockClear();
        searchParamsState.value = '';
        segmentAccordionSpy.mockClear();
        storageScopeState.value = 'guest';
        highlightsState.value = [];
        useHighlightsSpy.mockClear();
        vi.mocked(useMediaQuery).mockReturnValue(true);
        saveReadingProgressMock.mockClear();
        toastSuccessMock.mockClear();
        window.scrollTo = vi.fn();
        localStorageState.clear();
        vi.mocked(window.localStorage.getItem).mockImplementation((key: string) => localStorageState.get(key) ?? null);
        vi.mocked(window.localStorage.setItem).mockImplementation((key: string, value: string) => {
            localStorageState.set(key, value);
        });
        vi.mocked(window.localStorage.removeItem).mockImplementation((key: string) => {
            localStorageState.delete(key);
        });
        vi.mocked(window.localStorage.clear).mockImplementation(() => {
            localStorageState.clear();
        });
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
        expect(screen.getByRole('button', { name: 'Open chat' })).toBeInTheDocument();

        // Before completion, displays feedback form
        expect(screen.getByTestId('mock-content-feedback')).toBeInTheDocument();
    });

    it('requests the full per-item highlight cap for the reader', () => {
        render(<ReaderView content={mockContent} />);

        expect(useHighlightsSpy).toHaveBeenCalledWith('test-item-1', { limit: 50 });
    });

    it('lets readers open Ask Author before full completion', async () => {
        render(<ReaderView content={mockContent} />);

        fireEvent.click(screen.getByRole('button', { name: 'Open chat' }));

        await waitFor(() => {
            expect(screen.getByTestId('mock-author-chat')).toBeInTheDocument();
            expect(screen.getByText('Test Author')).toBeInTheDocument();
            expect(screen.getByText('in-progress-chat')).toBeInTheDocument();
        });
    });

    it('closes the pre-completion author chat once the reader reaches completion', async () => {
        render(<ReaderView content={mockContent} />);

        fireEvent.click(screen.getByRole('button', { name: 'Open chat' }));

        await waitFor(() => {
            expect(screen.getByTestId('mock-author-chat')).toBeInTheDocument();
        });

        fireEvent.click(screen.getByTestId('manual-complete-seg-1'));

        await waitFor(() => {
            expect(screen.queryByTestId('mock-author-chat')).not.toBeInTheDocument();
            expect(screen.getByTestId('mock-completion-card')).toBeInTheDocument();
        });
    });

    it('passes the audio sync callback into the hero header when narration exists', () => {
        render(<ReaderView content={{ ...mockContent, audio_url: 'https://example.com/audio.mp3' }} />);

        expect(readerHeroHeaderSpy).toHaveBeenCalledWith(expect.objectContaining({
            onAudioTimeChange: expect.any(Function),
        }));
    });

    it('does not mark a segment as completed when the user opens it manually', async () => {
        render(<ReaderView content={mockContent} />);

        fireEvent.click(screen.getByTestId('manual-open-seg-1'));

        await waitFor(() => {
            const latestProps = segmentAccordionSpy.mock.lastCall?.[0];
            expect(latestProps?.completedSegments.has('seg-1')).toBe(false);
        });
    });

    it('marks a segment as completed when the user explicitly completes it', async () => {
        render(<ReaderView content={mockContent} />);

        fireEvent.click(screen.getByTestId('manual-complete-seg-1'));

        await waitFor(() => {
            const latestProps = segmentAccordionSpy.mock.lastCall?.[0];
            expect(latestProps?.completedSegments.has('seg-1')).toBe(true);
        });
    });

    it('finishes all segments and lets undo restore the prior reading state', async () => {
        progressState.value = {
            completed: ['seg-1'],
            maxSegmentIndex: 0,
            lastSegmentIndex: 0,
        };

        const multiSegmentContent = {
            ...mockContent,
            segments: [
                ...mockContent.segments,
                {
                    id: 'seg-2',
                    item_id: 'item-1',
                    order_index: 1,
                    title: 'Segment 2',
                    markdown_body: 'Body 2',
                    start_time_sec: null,
                    end_time_sec: null,
                },
                {
                    id: 'seg-3',
                    item_id: 'item-1',
                    order_index: 2,
                    title: 'Segment 3',
                    markdown_body: 'Body 3',
                    start_time_sec: null,
                    end_time_sec: null,
                },
            ],
        } as ContentItemWithSegments;

        render(<ReaderView content={multiSegmentContent} />);

        await waitFor(() => {
            const latestProps = segmentAccordionSpy.mock.lastCall?.[0];
            expect(latestProps?.completedSegments.has('seg-1')).toBe(true);
            expect(latestProps?.completedSegments.has('seg-2')).toBe(false);
            expect(latestProps?.completedSegments.has('seg-3')).toBe(false);
        });

        fireEvent.click(screen.getByTestId('finish-reading'));

        await waitFor(() => {
            const latestHeroProps = readerHeroHeaderSpy.mock.lastCall?.[0];
            const latestAccordionProps = segmentAccordionSpy.mock.lastCall?.[0];

            expect(latestHeroProps?.segmentsCompleted).toBe(3);
            expect(latestAccordionProps?.completedSegments.has('seg-1')).toBe(true);
            expect(latestAccordionProps?.completedSegments.has('seg-2')).toBe(true);
            expect(latestAccordionProps?.completedSegments.has('seg-3')).toBe(true);
            expect(screen.getByTestId('mock-completion-card')).toBeInTheDocument();
        });

        expect(saveReadingProgressMock).toHaveBeenLastCalledWith(
            'test-item-1',
            expect.objectContaining({
                completed: ['seg-1', 'seg-2', 'seg-3'],
                isCompleted: true,
                maxSegmentIndex: 2,
            })
        );

        const undoAction = toastSuccessMock.mock.calls[0]?.[1]?.action;
        expect(undoAction).toEqual(expect.objectContaining({ label: 'Undo' }));

        act(() => {
            undoAction.onClick();
        });

        await waitFor(() => {
            const latestHeroProps = readerHeroHeaderSpy.mock.lastCall?.[0];
            const latestAccordionProps = segmentAccordionSpy.mock.lastCall?.[0];

            expect(latestHeroProps?.segmentsCompleted).toBe(1);
            expect(latestAccordionProps?.completedSegments.has('seg-1')).toBe(true);
            expect(latestAccordionProps?.completedSegments.has('seg-2')).toBe(false);
            expect(latestAccordionProps?.completedSegments.has('seg-3')).toBe(false);
            expect(screen.queryByTestId('mock-completion-card')).not.toBeInTheDocument();
        });

        expect(saveReadingProgressMock).toHaveBeenLastCalledWith(
            'test-item-1',
            expect.objectContaining({
                completed: ['seg-1'],
                isCompleted: false,
                maxSegmentIndex: 0,
            })
        );
        expect(removeFromProgressMock).not.toHaveBeenCalled();
    });

    it('filters stale saved completed segments against the current deep-mode segments', async () => {
        progressState.value = {
            completed: ['seg-1', 'seg-missing'],
            maxSegmentIndex: 4,
            lastSegmentIndex: 4,
        };

        render(<ReaderView content={mockContent} />);

        await waitFor(() => {
            const latestHeroProps = readerHeroHeaderSpy.mock.lastCall?.[0];
            const latestAccordionProps = segmentAccordionSpy.mock.lastCall?.[0];

            expect(latestHeroProps?.segmentsCompleted).toBe(1);
            expect(latestAccordionProps?.completedSegments.has('seg-1')).toBe(true);
            expect(latestAccordionProps?.completedSegments.has('seg-missing')).toBe(false);
        });
    });

    it('renders the big idea if available', () => {
        const { container } = render(<ReaderView content={mockContent} />);
        expect(screen.getByText('The giant idea')).toBeInTheDocument();
        expect(screen.getByText('The Big Idea')).toBeInTheDocument();
        expect(container.querySelector('.reading-copy.reading-copy-default')).not.toBeNull();
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

    it('does not save reading progress when the reader is only opened passively', async () => {
        vi.useFakeTimers();

        try {
            render(<ReaderView content={mockContent} />);

            await act(async () => {
                await vi.advanceTimersByTimeAsync(1000);
            });

            expect(saveReadingProgressMock).not.toHaveBeenCalled();
        } finally {
            vi.useRealTimers();
        }
    });

    it('renders series navigation when the item belongs to a series', () => {
        render(
            <ReaderView
                content={{
                    ...mockContent,
                    series_id: 'series-1',
                    series_order: 2,
                    seriesContext: {
                        series: {
                            id: 'series-1',
                            slug: 'matthew',
                            title: 'Matthew',
                            description: null,
                        },
                        totalItems: 8,
                        currentOrder: 2,
                        previousItem: {
                            id: 'prev-1',
                            title: 'Matthew 1-4',
                            series_order: 1,
                        },
                        nextItem: {
                            id: 'next-1',
                            title: 'Matthew 8-12',
                            series_order: 3,
                        },
                    },
                }}
            />
        );

        expect(screen.getByText('Part 2 of 8 in Matthew')).toBeInTheDocument();
        expect(screen.queryByText('Guided reading sequence')).not.toBeInTheDocument();
        expect(screen.queryByText('You are reading item 2 in this sequence.')).not.toBeInTheDocument();
        expect(screen.getByRole('link', { name: 'View all parts' })).toHaveAttribute('href', '/series/matthew');
        expect(screen.getByRole('link', { name: /Matthew 1-4/i })).toHaveAttribute('href', '/read/prev-1/matthew-1-4');
        expect(screen.getByRole('link', { name: /Matthew 8-12/i })).toHaveAttribute('href', '/read/next-1/matthew-8-12');
    });

    it('renders explicit first and last part states when adjacent items are missing', () => {
        render(
            <ReaderView
                content={{
                    ...mockContent,
                    series_id: 'series-1',
                    series_order: 1,
                    seriesContext: {
                        series: {
                            id: 'series-1',
                            slug: 'matthew',
                            title: 'Matthew',
                            description: null,
                        },
                        totalItems: 1,
                        currentOrder: 1,
                        previousItem: null,
                        nextItem: null,
                    },
                }}
            />
        );

        expect(screen.getByText('Start of the series')).toBeInTheDocument();
        expect(screen.getByText('End of the series')).toBeInTheDocument();
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
                    isOpen: false,
                    onOpenChange: expect.any(Function),
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

    it('opens the notes drawer to a tapped inline highlight on mobile', async () => {
        vi.mocked(useMediaQuery).mockReturnValue(false);
        highlightsState.value = [
            {
                id: 'highlight-1',
                user_id: 'user-1',
                content_item_id: 'test-item-1',
                segment_id: 'seg-1',
                highlighted_text: 'Body 1',
                note_body: 'Mobile note',
                color: 'yellow',
                anchor_start: 0,
                anchor_end: 6,
                created_at: '2026-03-11T12:00:00.000Z',
                updated_at: null,
                content_item: null,
                segment: null,
            },
        ];

        render(<ReaderView content={mockContent} />);

        fireEvent.click(screen.getByTestId('activate-highlight'));

        await waitFor(() => {
            expect(notesDrawerSpy).toHaveBeenLastCalledWith(
                expect.objectContaining({
                    activeHighlightId: 'highlight-1',
                    isOpen: true,
                })
            );
            expect(screen.getByTestId('mock-notes-drawer')).toHaveTextContent('open');
        });
    });

    it('expands the matching deep-mode segment when playback time changes', async () => {
        const timedContent = {
            ...mockContent,
            audio_url: 'https://example.com/audio.mp3',
            segments: [
                {
                    id: 'seg-1',
                    item_id: 'item-1',
                    order_index: 0,
                    title: 'Segment 1',
                    markdown_body: 'Body 1',
                    start_time_sec: 0,
                    end_time_sec: 30,
                },
                {
                    id: 'seg-2',
                    item_id: 'item-1',
                    order_index: 1,
                    title: 'Segment 2',
                    markdown_body: 'Body 2',
                    start_time_sec: 30,
                    end_time_sec: 60,
                },
                {
                    id: 'seg-3',
                    item_id: 'item-1',
                    order_index: 2,
                    title: 'Segment 3',
                    markdown_body: 'Body 3',
                    start_time_sec: 60,
                    end_time_sec: 90,
                },
            ],
        } as ContentItemWithSegments;

        render(<ReaderView content={timedContent} />);

        expect(screen.getByTestId('mock-segment-accordion')).toHaveTextContent('none');

        fireEvent.click(screen.getByTestId('sync-audio-seg-2'));

        await waitFor(() => {
            expect(screen.getByTestId('mock-segment-accordion')).toHaveTextContent('seg-2');
            expect(screen.getByTestId('mock-active-audio-segment')).toHaveTextContent('seg-2');
        });
    });

    it('highlights the narrated segment while audio is actively playing', async () => {
        const timedContent = {
            ...mockContent,
            audio_url: 'https://example.com/audio.mp3',
            segments: [
                {
                    id: 'seg-1',
                    item_id: 'item-1',
                    order_index: 0,
                    title: 'Segment 1',
                    markdown_body: 'Body 1',
                    start_time_sec: 0,
                    end_time_sec: 30,
                },
                {
                    id: 'seg-2',
                    item_id: 'item-1',
                    order_index: 1,
                    title: 'Segment 2',
                    markdown_body: 'Body 2',
                    start_time_sec: 30,
                    end_time_sec: 60,
                },
            ],
        } as ContentItemWithSegments;

        render(<ReaderView content={timedContent} />);

        expect(screen.getByTestId('mock-active-audio-segment')).toHaveTextContent('none');

        fireEvent.click(screen.getByTestId('sync-audio-seg-2'));

        await waitFor(() => {
            expect(screen.getByTestId('mock-active-audio-segment')).toHaveTextContent('seg-2');
        });

        fireEvent.click(screen.getByTestId('pause-audio'));

        await waitFor(() => {
            expect(screen.getByTestId('mock-active-audio-segment')).toHaveTextContent('none');
        });
    });

    it('requests accordion-managed scroll while follow audio is enabled', async () => {
        const timedContent = {
            ...mockContent,
            audio_url: 'https://example.com/audio.mp3',
            segments: [
                {
                    id: 'seg-1',
                    item_id: 'item-1',
                    order_index: 0,
                    title: 'Segment 1',
                    markdown_body: 'Body 1',
                    start_time_sec: 0,
                    end_time_sec: 30,
                },
                {
                    id: 'seg-2',
                    item_id: 'item-1',
                    order_index: 1,
                    title: 'Segment 2',
                    markdown_body: 'Body 2',
                    start_time_sec: 30,
                    end_time_sec: 60,
                },
            ],
        } as ContentItemWithSegments;

        render(<ReaderView content={timedContent} />);

        fireEvent.click(screen.getByTestId('sync-audio-seg-2'));

        await waitFor(() => {
            const latestProps = segmentAccordionSpy.mock.lastCall?.[0];
            expect(latestProps?.expandedSegmentId).toBe('seg-2');
            expect(latestProps?.scrollRequest).toEqual(expect.objectContaining({
                segmentId: 'seg-2',
                initialScrollY: expect.any(Number),
                requestId: 1,
            }));
        });
    });

    it('restores the saved local audio position and expands the matching segment on return', async () => {
        const timedContent = {
            ...mockContent,
            audio_url: 'https://example.com/audio.mp3',
            segments: [
                {
                    id: 'seg-1',
                    item_id: 'item-1',
                    order_index: 0,
                    title: 'Segment 1',
                    markdown_body: 'Body 1',
                    start_time_sec: 0,
                    end_time_sec: 30,
                },
                {
                    id: 'seg-2',
                    item_id: 'item-1',
                    order_index: 1,
                    title: 'Segment 2',
                    markdown_body: 'Body 2',
                    start_time_sec: 30,
                    end_time_sec: 60,
                },
            ],
        } as ContentItemWithSegments;

        localStorage.setItem(audioResumeKey('guest', 'test-item-1'), JSON.stringify({
            currentTimeSec: 35,
            lastUpdatedAt: '2026-04-07T12:00:00.000Z',
            audioSource: 'https://example.com/audio.mp3',
        }));

        render(<ReaderView content={timedContent} />);

        await waitFor(() => {
            expect(screen.getByTestId('mock-segment-accordion')).toHaveTextContent('seg-2');
            expect(readerHeroHeaderSpy).toHaveBeenLastCalledWith(expect.objectContaining({
                initialAudioTimeSec: 35,
            }));
        });
    });

    it('migrates guest audio resume into signed-in scope without resetting the active position', async () => {
        const timedContent = {
            ...mockContent,
            audio_url: 'https://example.com/audio.mp3',
            segments: [
                {
                    id: 'seg-1',
                    item_id: 'item-1',
                    order_index: 0,
                    title: 'Segment 1',
                    markdown_body: 'Body 1',
                    start_time_sec: 0,
                    end_time_sec: 30,
                },
                {
                    id: 'seg-2',
                    item_id: 'item-1',
                    order_index: 1,
                    title: 'Segment 2',
                    markdown_body: 'Body 2',
                    start_time_sec: 30,
                    end_time_sec: 60,
                },
            ],
        } as ContentItemWithSegments;

        localStorage.setItem(audioResumeKey('guest', 'test-item-1'), JSON.stringify({
            currentTimeSec: 35,
            lastUpdatedAt: '2026-04-07T12:00:00.000Z',
            audioSource: 'https://example.com/audio.mp3',
        }));

        const { rerender } = render(<ReaderView content={timedContent} />);

        await waitFor(() => {
            expect(screen.getByTestId('mock-segment-accordion')).toHaveTextContent('seg-2');
        });

        storageScopeState.value = 'user:user-a';
        rerender(<ReaderView content={timedContent} />);

        await waitFor(() => {
            expect(screen.getByTestId('mock-segment-accordion')).toHaveTextContent('seg-2');
            expect(JSON.parse(localStorageState.get(audioResumeKey('user:user-a', 'test-item-1')) || '{}')).toEqual(
                expect.objectContaining({
                    currentTimeSec: 35,
                    audioSource: 'https://example.com/audio.mp3',
                })
            );
        });
    });

    it('marks fully passed segments as completed when audio playback advances', async () => {
        const timedContent = {
            ...mockContent,
            audio_url: 'https://example.com/audio.mp3',
            segments: [
                {
                    id: 'seg-1',
                    item_id: 'item-1',
                    order_index: 0,
                    title: 'Segment 1',
                    markdown_body: 'Body 1',
                    start_time_sec: 0,
                    end_time_sec: 30,
                },
                {
                    id: 'seg-2',
                    item_id: 'item-1',
                    order_index: 1,
                    title: 'Segment 2',
                    markdown_body: 'Body 2',
                    start_time_sec: 30,
                    end_time_sec: 60,
                },
                {
                    id: 'seg-3',
                    item_id: 'item-1',
                    order_index: 2,
                    title: 'Segment 3',
                    markdown_body: 'Body 3',
                    start_time_sec: 60,
                    end_time_sec: 90,
                },
            ],
        } as ContentItemWithSegments;

        render(<ReaderView content={timedContent} />);

        fireEvent.click(screen.getByTestId('sync-audio-seg-2'));

        await waitFor(() => {
            const latestHeroProps = readerHeroHeaderSpy.mock.lastCall?.[0];
            const latestAccordionProps = segmentAccordionSpy.mock.lastCall?.[0];

            expect(latestHeroProps?.segmentsCompleted).toBe(1);
            expect(latestAccordionProps?.completedSegments.has('seg-1')).toBe(true);
            expect(latestAccordionProps?.completedSegments.has('seg-2')).toBe(false);
        });

        fireEvent.click(screen.getByTestId('sync-audio-seg-3'));

        await waitFor(() => {
            const latestHeroProps = readerHeroHeaderSpy.mock.lastCall?.[0];
            const latestAccordionProps = segmentAccordionSpy.mock.lastCall?.[0];

            expect(latestHeroProps?.segmentsCompleted).toBe(2);
            expect(latestAccordionProps?.completedSegments.has('seg-2')).toBe(true);
            expect(latestAccordionProps?.completedSegments.has('seg-3')).toBe(false);
        });
    });

    it('ignores a saved audio resume point when it belongs to an older narration asset', async () => {
        const timedContent = {
            ...mockContent,
            audio_url: 'https://example.com/audio-v2.mp3',
            segments: [
                {
                    id: 'seg-1',
                    item_id: 'item-1',
                    order_index: 0,
                    title: 'Segment 1',
                    markdown_body: 'Body 1',
                    start_time_sec: 0,
                    end_time_sec: 30,
                },
                {
                    id: 'seg-2',
                    item_id: 'item-1',
                    order_index: 1,
                    title: 'Segment 2',
                    markdown_body: 'Body 2',
                    start_time_sec: 30,
                    end_time_sec: 60,
                },
            ],
        } as ContentItemWithSegments;

        localStorage.setItem(audioResumeKey('guest', 'test-item-1'), JSON.stringify({
            currentTimeSec: 35,
            lastUpdatedAt: '2026-04-07T12:00:00.000Z',
            audioSource: 'https://example.com/audio-v1.mp3',
        }));

        render(<ReaderView content={timedContent} />);

        await waitFor(() => {
            expect(screen.getByTestId('mock-segment-accordion')).toHaveTextContent('none');
            expect(localStorageState.has(audioResumeKey('guest', 'test-item-1'))).toBe(false);
            expect(readerHeroHeaderSpy).toHaveBeenLastCalledWith(expect.objectContaining({
                initialAudioTimeSec: 0,
            }));
        });
    });

    it('preserves the in-memory audio position when auth hydration changes storage scope mid-session', async () => {
        const timedContent = {
            ...mockContent,
            audio_url: 'https://example.com/audio.mp3',
            segments: [
                {
                    id: 'seg-1',
                    item_id: 'item-1',
                    order_index: 0,
                    title: 'Segment 1',
                    markdown_body: 'Body 1',
                    start_time_sec: 0,
                    end_time_sec: 30,
                },
                {
                    id: 'seg-2',
                    item_id: 'item-1',
                    order_index: 1,
                    title: 'Segment 2',
                    markdown_body: 'Body 2',
                    start_time_sec: 30,
                    end_time_sec: 60,
                },
            ],
        } as ContentItemWithSegments;

        const { rerender } = render(<ReaderView content={timedContent} />);

        fireEvent.click(screen.getByTestId('sync-audio-seg-2'));

        await waitFor(() => {
            expect(screen.getByTestId('mock-segment-accordion')).toHaveTextContent('seg-2');
        });

        storageScopeState.value = 'user:user-a';
        rerender(<ReaderView content={timedContent} />);

        await waitFor(() => {
            expect(screen.getByTestId('mock-segment-accordion')).toHaveTextContent('seg-2');
            expect(JSON.parse(localStorageState.get(audioResumeKey('user:user-a', 'test-item-1')) || '{}')).toEqual(
                expect.objectContaining({
                    currentTimeSec: 35,
                })
            );
        });
    });

    it('lets manual segment browsing pause audio follow without hiding the playing segment cue', async () => {
        const timedContent = {
            ...mockContent,
            audio_url: 'https://example.com/audio.mp3',
            segments: [
                {
                    id: 'seg-1',
                    item_id: 'item-1',
                    order_index: 0,
                    title: 'Segment 1',
                    markdown_body: 'Body 1',
                    start_time_sec: 0,
                    end_time_sec: 30,
                },
                {
                    id: 'seg-2',
                    item_id: 'item-1',
                    order_index: 1,
                    title: 'Segment 2',
                    markdown_body: 'Body 2',
                    start_time_sec: 30,
                    end_time_sec: 60,
                },
                {
                    id: 'seg-3',
                    item_id: 'item-1',
                    order_index: 2,
                    title: 'Segment 3',
                    markdown_body: 'Body 3',
                    start_time_sec: 60,
                    end_time_sec: 90,
                },
            ],
        } as ContentItemWithSegments;

        render(<ReaderView content={timedContent} />);

        fireEvent.click(screen.getByTestId('sync-audio-seg-2'));

        await waitFor(() => {
            expect(screen.getByTestId('mock-segment-accordion')).toHaveTextContent('seg-2');
        });

        await act(async () => {
            await new Promise((resolve) => window.setTimeout(resolve, 320));
        });
        vi.mocked(window.scrollTo).mockClear();

        fireEvent.click(screen.getByTestId('manual-open-seg-1'));

        await waitFor(() => {
            expect(screen.getByTestId('mock-segment-accordion')).toHaveTextContent('seg-1');
            expect(screen.getByTestId('mock-active-audio-segment')).toHaveTextContent('seg-2');
        });

        fireEvent.click(screen.getByTestId('sync-audio-seg-3'));

        await act(async () => {
            await new Promise((resolve) => window.setTimeout(resolve, 320));
        });

        await waitFor(() => {
            expect(screen.getByTestId('mock-segment-accordion')).toHaveTextContent('seg-1');
        });
        expect(window.scrollTo).not.toHaveBeenCalled();

        await waitFor(() => {
            const latestHeroProps = readerHeroHeaderSpy.mock.lastCall?.[0];
            expect(latestHeroProps?.segmentsCompleted).toBe(2);
        });

        fireEvent.click(screen.getByTestId('resume-audio-follow'));

        await waitFor(() => {
            expect(screen.getByTestId('mock-segment-accordion')).toHaveTextContent('seg-3');
            expect(screen.getByTestId('mock-active-audio-segment')).toHaveTextContent('seg-3');
        });
    });

    it('requests accordion-managed scroll when follow audio is resumed explicitly', async () => {
        const timedContent = {
            ...mockContent,
            audio_url: 'https://example.com/audio.mp3',
            segments: [
                {
                    id: 'seg-1',
                    item_id: 'item-1',
                    order_index: 0,
                    title: 'Segment 1',
                    markdown_body: 'Body 1',
                    start_time_sec: 0,
                    end_time_sec: 30,
                },
                {
                    id: 'seg-2',
                    item_id: 'item-1',
                    order_index: 1,
                    title: 'Segment 2',
                    markdown_body: 'Body 2',
                    start_time_sec: 30,
                    end_time_sec: 60,
                },
                {
                    id: 'seg-3',
                    item_id: 'item-1',
                    order_index: 2,
                    title: 'Segment 3',
                    markdown_body: 'Body 3',
                    start_time_sec: 60,
                    end_time_sec: 90,
                },
            ],
        } as ContentItemWithSegments;

        render(<ReaderView content={timedContent} />);

        fireEvent.click(screen.getByTestId('sync-audio-seg-2'));
        expect(screen.getByTestId('mock-segment-accordion')).toHaveTextContent('seg-2');

        fireEvent.click(screen.getByTestId('manual-open-seg-1'));
        expect(screen.getByTestId('mock-segment-accordion')).toHaveTextContent('seg-1');

        fireEvent.click(screen.getByTestId('sync-audio-seg-3'));
        expect(screen.getByTestId('mock-segment-accordion')).toHaveTextContent('seg-1');

        fireEvent.click(screen.getByTestId('resume-audio-follow'));

        await waitFor(() => {
            const latestProps = segmentAccordionSpy.mock.lastCall?.[0];
            expect(latestProps?.expandedSegmentId).toBe('seg-3');
            expect(latestProps?.scrollRequest).toEqual(expect.objectContaining({
                segmentId: 'seg-3',
                initialScrollY: expect.any(Number),
                requestId: 2,
            }));
        });
    });

    it('does not auto-expand a segment when narration timings are unavailable', async () => {
        render(<ReaderView content={{ ...mockContent, audio_url: 'https://example.com/audio.mp3' }} />);

        fireEvent.click(screen.getByTestId('sync-audio-seg-1'));

        await waitFor(() => {
            expect(screen.getByTestId('mock-segment-accordion')).toHaveTextContent('none');
        });
    });

    it('saves reading progress when audio playback covers a completed segment boundary', async () => {
        vi.useFakeTimers();

        try {
            const timedContent = {
                ...mockContent,
                audio_url: 'https://example.com/audio.mp3',
                segments: [
                    {
                        id: 'seg-1',
                        item_id: 'item-1',
                        order_index: 0,
                        title: 'Segment 1',
                        markdown_body: 'Body 1',
                        start_time_sec: 0,
                        end_time_sec: 30,
                    },
                    {
                        id: 'seg-2',
                        item_id: 'item-1',
                        order_index: 1,
                        title: 'Segment 2',
                        markdown_body: 'Body 2',
                        start_time_sec: 30,
                        end_time_sec: 60,
                    },
                ],
            } as ContentItemWithSegments;

            render(<ReaderView content={timedContent} />);

            await act(async () => {
                await vi.advanceTimersByTimeAsync(1000);
            });
            saveReadingProgressMock.mockClear();

            fireEvent.click(screen.getByTestId('sync-audio-seg-2'));

            expect(screen.getByTestId('mock-segment-accordion')).toHaveTextContent('seg-2');

            await act(async () => {
                await vi.advanceTimersByTimeAsync(1000);
            });

            expect(saveReadingProgressMock).toHaveBeenCalledWith(
                'test-item-1',
                expect.objectContaining({
                    completed: ['seg-1'],
                    isCompleted: false,
                    maxSegmentIndex: 0,
                })
            );
        } finally {
            vi.useRealTimers();
        }
    });

    it('flushes pending reading progress when the reader unmounts before the debounce completes', async () => {
        vi.useFakeTimers();

        try {
            const { unmount } = render(<ReaderView content={mockContent} />);

            fireEvent.click(screen.getByTestId('manual-open-seg-1'));

            expect(saveReadingProgressMock).not.toHaveBeenCalled();

            unmount();

            expect(saveReadingProgressMock).toHaveBeenCalledWith(
                'test-item-1',
                expect.objectContaining({
                    completed: [],
                    isCompleted: false,
                    maxSegmentIndex: 0,
                })
            );
        } finally {
            vi.useRealTimers();
        }
    });

    it('persists a local audio resume point while playback advances', async () => {
        const timedContent = {
            ...mockContent,
            audio_url: 'https://example.com/audio.mp3',
            segments: [
                {
                    id: 'seg-1',
                    item_id: 'item-1',
                    order_index: 0,
                    title: 'Segment 1',
                    markdown_body: 'Body 1',
                    start_time_sec: 0,
                    end_time_sec: 30,
                },
                {
                    id: 'seg-2',
                    item_id: 'item-1',
                    order_index: 1,
                    title: 'Segment 2',
                    markdown_body: 'Body 2',
                    start_time_sec: 30,
                    end_time_sec: 60,
                },
            ],
        } as ContentItemWithSegments;

        render(<ReaderView content={timedContent} />);

        fireEvent.click(screen.getByTestId('sync-audio-seg-2'));

        await waitFor(() => {
            expect(JSON.parse(localStorageState.get(audioResumeKey('guest', 'test-item-1')) || '{}')).toEqual(
                expect.objectContaining({
                    currentTimeSec: 35,
                    audioSource: 'https://example.com/audio.mp3',
                })
            );
        });
    });

    it('clears the local audio resume point once playback reaches the end', async () => {
        const timedContent = {
            ...mockContent,
            audio_url: 'https://example.com/audio.mp3',
            segments: [
                {
                    id: 'seg-1',
                    item_id: 'item-1',
                    order_index: 0,
                    title: 'Segment 1',
                    markdown_body: 'Body 1',
                    start_time_sec: 0,
                    end_time_sec: 30,
                },
                {
                    id: 'seg-2',
                    item_id: 'item-1',
                    order_index: 1,
                    title: 'Segment 2',
                    markdown_body: 'Body 2',
                    start_time_sec: 30,
                    end_time_sec: 60,
                },
            ],
        } as ContentItemWithSegments;

        render(<ReaderView content={timedContent} />);

        fireEvent.click(screen.getByTestId('sync-audio-seg-2'));
        await waitFor(() => {
            expect(localStorageState.has(audioResumeKey('guest', 'test-item-1'))).toBe(true);
        });

        fireEvent.click(screen.getByTestId('sync-audio-ended'));

        await waitFor(() => {
            expect(localStorageState.has(audioResumeKey('guest', 'test-item-1'))).toBe(false);
        });
    });

    it('marks all segments completed when playback ends even if final currentTime is slightly below the last boundary', async () => {
        const timedContent = {
            ...mockContent,
            audio_url: 'https://example.com/audio.mp3',
            segments: [
                {
                    id: 'seg-1',
                    item_id: 'item-1',
                    order_index: 0,
                    title: 'Segment 1',
                    markdown_body: 'Body 1',
                    start_time_sec: 0,
                    end_time_sec: 30,
                },
                {
                    id: 'seg-2',
                    item_id: 'item-1',
                    order_index: 1,
                    title: 'Segment 2',
                    markdown_body: 'Body 2',
                    start_time_sec: 30,
                    end_time_sec: 60,
                },
                {
                    id: 'seg-3',
                    item_id: 'item-1',
                    order_index: 2,
                    title: 'Segment 3',
                    markdown_body: 'Body 3',
                    start_time_sec: 60,
                    end_time_sec: 90,
                },
            ],
        } as ContentItemWithSegments;

        render(<ReaderView content={timedContent} />);

        fireEvent.click(screen.getByTestId('sync-audio-ended-short'));

        await waitFor(() => {
            const latestHeroProps = readerHeroHeaderSpy.mock.lastCall?.[0];
            const latestAccordionProps = segmentAccordionSpy.mock.lastCall?.[0];

            expect(latestHeroProps?.segmentsCompleted).toBe(3);
            expect(latestAccordionProps?.completedSegments.has('seg-1')).toBe(true);
            expect(latestAccordionProps?.completedSegments.has('seg-2')).toBe(true);
            expect(latestAccordionProps?.completedSegments.has('seg-3')).toBe(true);
        });
    });

    it('removes malformed local audio resume payloads during restore', async () => {
        const timedContent = {
            ...mockContent,
            audio_url: 'https://example.com/audio.mp3',
            segments: [
                {
                    id: 'seg-1',
                    item_id: 'item-1',
                    order_index: 0,
                    title: 'Segment 1',
                    markdown_body: 'Body 1',
                    start_time_sec: 0,
                    end_time_sec: 30,
                },
            ],
        } as ContentItemWithSegments;

        localStorageState.set(audioResumeKey('guest', 'test-item-1'), '{broken-json');

        render(<ReaderView content={timedContent} />);

        await waitFor(() => {
            expect(localStorageState.has(audioResumeKey('guest', 'test-item-1'))).toBe(false);
            expect(screen.getByTestId('mock-segment-accordion')).toHaveTextContent('none');
        });
    });
});
