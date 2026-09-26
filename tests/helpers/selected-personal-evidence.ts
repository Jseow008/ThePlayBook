import type { RankedPersonalEvidence } from '@/lib/server/personal-evidence-ranking';

export function selectedPersonalEvidence(): RankedPersonalEvidence {
    const text = 'Verified written note: discipline and focus.';
    return {
        evidence: { type: 'highlight', evidenceId: 'highlight:owned', id: 'owned', userId: 'user-123',
            contentItemId: 'content-1', createdAt: null, updatedAt: null, fingerprint: 'current', sourceStatus: 'available',
            source: { id: 'content-1', title: 'Saved source', author: null, updatedAt: '2026-09-01' },
            highlightedText: 'The original passage.', noteBody: text, color: null, segmentId: null,
            anchorStart: null, anchorEnd: null, segment: null, readerAnchor: null },
        score: .9, exactQuote: null,
        spans: [{ field: 'noteBody', start: 0, end: text.length, text, score: .9 }],
    };
}
