import { render, screen } from '@testing-library/react';
import { vi } from 'vitest';
import { ReaderHeroHeader } from '@/components/reader/ReaderHeroHeader';
import { APP_NAME } from '@/lib/brand';

vi.mock('next/image', () => ({
    default: ({ alt, ...props }: any) => {
        const { fill, priority, sizes, ...imgProps } = props;
        void fill;
        void priority;
        void sizes;
        return <img alt={alt} {...imgProps} />;
    },
}));

vi.mock('@/components/reader/AudioPlayer', () => ({
    AudioPlayer: () => <div data-testid="mock-audio-player" />,
}));

vi.mock('@/components/ui/ShareButton', () => ({
    ShareButton: () => <button type="button">Share</button>,
}));

vi.mock('@/components/reader/ReaderSettingsMenu', () => ({
    ReaderSettingsMenu: () => <button type="button">Settings</button>,
}));

vi.mock('@/hooks/useReadingTimer', () => ({
    useReadingTimer: () => ({ formattedTime: '0:00' }),
}));

describe('ReaderHeroHeader', () => {
    it('clamps progress above 100 percent', () => {
        const { container } = render(
            <ReaderHeroHeader
                title="Clamped Book"
                author="Author"
                type="book"
                coverImageUrl={null}
                audioUrl={null}
                durationSeconds={600}
                segmentsTotal={10}
                segmentsRead={14}
            />
        );

        expect(screen.getByText('100%')).toBeInTheDocument();
        expect(document.title).toBe(`(100%) Clamped Book — ${APP_NAME}`);
        expect(container.querySelector('[style="width: 100%;"]')).not.toBeNull();
    });

    it('renders zero progress when total segments is zero', () => {
        const { container } = render(
            <ReaderHeroHeader
                title="Empty Book"
                author="Author"
                type="book"
                coverImageUrl={null}
                audioUrl={null}
                durationSeconds={600}
                segmentsTotal={0}
                segmentsRead={5}
            />
        );

        expect(screen.getByText('0%')).toBeInTheDocument();
        expect(document.title).toBe(`Empty Book — ${APP_NAME}`);
        expect(container.querySelector('[style="width: 0%;"]')).not.toBeNull();
    });
});
