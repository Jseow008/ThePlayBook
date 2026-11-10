import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ReaderHeroHeader } from '@/components/reader/ReaderHeroHeader';
import { COMPACT_READER_COVER_IMAGE_SIZES } from '@/components/ui/content-card-standards';

vi.hoisted(() => {
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://storage.example.com/');
});

vi.mock('@/components/reader/AudioPlayer', () => ({
    AudioPlayer: () => <div data-testid="mock-audio-player" />,
}));

vi.mock('@/components/reader/ReaderSettingsMenu', () => ({
    ReaderSettingsMenu: () => <button type="button">Reader settings</button>,
}));

vi.mock('@/components/ui/ContentShareMenu', () => ({
    ContentShareMenu: () => <button type="button">Share</button>,
}));

vi.mock('@/components/ui/ResilientImage', () => ({
    ResilientImage: ({ alt, sizes, unoptimized }: { alt: string; sizes?: string; unoptimized?: boolean }) => (
        <img alt={alt} data-testid="mock-cover-image" sizes={sizes} data-unoptimized={String(unoptimized)} />
    ),
}));

describe('ReaderHeroHeader', () => {
    it('keeps reading activity tracking out of the visible metadata', () => {
        const { container } = render(
            <ReaderHeroHeader
                title="Test Title"
                author="Test Author"
                type="article"
                coverImageUrl={null}
                audioUrl={null}
                durationSeconds={600}
                segmentsTotal={4}
                segmentsCompleted={0}
            />
        );

        expect(screen.queryByText(/read$/i)).not.toBeInTheDocument();
        expect(container.querySelector('.animate-ping')).not.toBeInTheDocument();
    });

    it('exposes completed-section progress to assistive technology', () => {
        render(
            <ReaderHeroHeader
                title="Test Title"
                author="Test Author"
                type="article"
                coverImageUrl={null}
                audioUrl={null}
                durationSeconds={600}
                segmentsTotal={4}
                segmentsCompleted={2}
            />
        );

        const progressbar = screen.getByRole('progressbar', { name: 'Reading progress' });

        expect(progressbar).toHaveAttribute('aria-valuemin', '0');
        expect(progressbar).toHaveAttribute('aria-valuemax', '4');
        expect(progressbar).toHaveAttribute('aria-valuenow', '2');
        expect(progressbar).toHaveAttribute('aria-valuetext', '2 of 4 sections completed');
        expect(screen.getByText('Sections completed')).toBeInTheDocument();
        expect(screen.getByText('2 of 4 sections completed')).toBeInTheDocument();
    });

    it('uses the compact reader cover image sizes hint', () => {
        render(
            <ReaderHeroHeader
                title="Test Title"
                author="Test Author"
                type="article"
                coverImageUrl="https://example.com/cover.jpg"
                audioUrl={null}
                durationSeconds={600}
                segmentsTotal={4}
                segmentsCompleted={2}
            />
        );

        expect(screen.getByTestId('mock-cover-image')).toHaveAttribute('sizes', COMPACT_READER_COVER_IMAGE_SIZES);
        expect(screen.getByTestId('mock-cover-image')).toHaveAttribute('data-unoptimized', 'false');
    });

    it('loads public storage covers directly', () => {
        render(
            <ReaderHeroHeader
                title="Test Title"
                author={null}
                type="article"
                coverImageUrl="https://storage.example.com/storage/v1/object/public/media/covers/test.jpg"
                audioUrl={null}
                durationSeconds={null}
                segmentsTotal={4}
                segmentsCompleted={0}
            />
        );

        expect(screen.getByTestId('mock-cover-image')).toHaveAttribute('data-unoptimized', 'true');
    });

    it('provides a destination for Listen links when audio is available', () => {
        render(
            <ReaderHeroHeader
                title="Test Title"
                author="Test Author"
                type="article"
                coverImageUrl={null}
                audioUrl="https://example.com/audio.mp3"
                durationSeconds={600}
                segmentsTotal={4}
                segmentsCompleted={0}
            />
        );

        expect(screen.getByRole('region', { name: 'Audio player' })).toHaveAttribute('id', 'audio-player');
    });
});
