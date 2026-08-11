import { render } from '@testing-library/react';
import PublicTemplate from '@/app/(public)/template';
import { vi } from 'vitest';

const { pathnameState } = vi.hoisted(() => ({
    pathnameState: { value: '/browse' },
}));

vi.mock('next/navigation', () => ({
    usePathname: () => pathnameState.value,
}));

describe('PublicTemplate', () => {
    beforeEach(() => {
        pathnameState.value = '/browse';
    });

    it('keeps the public route entrance animation outside Preview', () => {
        const { container } = render(
            <PublicTemplate>
                <div>Browse content</div>
            </PublicTemplate>
        );

        expect(container.firstElementChild).toHaveClass('animate-fade-in');
    });

    it('avoids a transformed containing block around Preview fixed actions', () => {
        pathnameState.value = '/preview/test-item-1';

        const { container } = render(
            <PublicTemplate>
                <div>Preview content</div>
            </PublicTemplate>
        );

        expect(container.firstElementChild).not.toHaveClass('animate-fade-in');
    });
});
