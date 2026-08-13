import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ReaderHeroHeader } from '@/components/reader/ReaderHeroHeader';
import { READER_COVER_IMAGE_SIZES } from '@/components/ui/content-card-standards';

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
    ResilientImage: ({ alt, sizes }: { alt: string; sizes?: string }) => (
        <img alt={alt} data-testid="mock-cover-image" sizes={sizes} />
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

    it('uses the shared reader cover image sizes hint', () => {
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

        expect(screen.getByTestId('mock-cover-image')).toHaveAttribute('sizes', READER_COVER_IMAGE_SIZES);
    });
});
