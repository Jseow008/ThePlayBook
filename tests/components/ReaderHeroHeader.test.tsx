import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ReaderHeroHeader } from '@/components/reader/ReaderHeroHeader';

vi.mock('@/components/reader/AudioPlayer', () => ({
    AudioPlayer: () => <div data-testid="mock-audio-player" />,
}));

vi.mock('@/components/reader/ReaderSettingsMenu', () => ({
    ReaderSettingsMenu: () => <button type="button">Reader settings</button>,
}));

vi.mock('@/components/ui/ShareButton', () => ({
    ShareButton: () => <button type="button">Share</button>,
}));

vi.mock('@/components/ui/ResilientImage', () => ({
    ResilientImage: () => <div data-testid="mock-cover-image" />,
}));

describe('ReaderHeroHeader', () => {
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
                formattedReadingTime="1:23"
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
});
