import { describe, expect, it } from 'vitest';
import { clampReadingProgressPercent, normalizeReadingProgress } from '@/lib/reading-progress';

describe('reading-progress helpers', () => {
    it('normalizes stale and duplicate completed ids against the current segments', () => {
        const validSegmentIds = Array.from({ length: 13 }, (_, index) => `seg-${index + 1}`);
        const completed = [
            ...validSegmentIds,
            'seg-14',
            'seg-15',
            'seg-16',
            'seg-17',
            'seg-18',
            'seg-1',
        ];

        const { progress, didChange } = normalizeReadingProgress({
            progress: {
                itemId: 'book-1',
                completed,
                lastSegmentIndex: 99,
                maxSegmentIndex: 99,
                lastReadAt: '2026-03-10T00:00:00.000Z',
                isCompleted: false,
                totalSegments: 18,
            },
            itemId: 'book-1',
            totalSegments: 13,
            validSegmentIds,
        });

        expect(didChange).toBe(true);
        expect(progress.completed).toEqual(validSegmentIds);
        expect(progress.lastSegmentIndex).toBe(12);
        expect(progress.maxSegmentIndex).toBe(12);
        expect(progress.totalSegments).toBe(13);
        expect(progress.isCompleted).toBe(true);
    });

    it('clamps percentages into the 0 to 100 range', () => {
        expect(clampReadingProgressPercent(14, 10)).toBe(100);
        expect(clampReadingProgressPercent(5, 0)).toBe(0);
    });
});
