import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import ReactMarkdown from 'react-markdown';
import { describe, expect, it } from 'vitest';
import { renderEvidenceExtracts } from '@/lib/server/evidence-extract-response';
import { selectedPersonalEvidence } from '../helpers/selected-personal-evidence';

const html = (text: string) => renderToStaticMarkup(<ReactMarkdown>{text}</ReactMarkdown>);

describe('evidence extracts in the actual Markdown renderer', () => {
    it('shows the note separately from a conflicting highlight without synthesizing', () => {
        const item = selectedPersonalEvidence();
        item.spans.unshift({ field: 'highlightedText', start: 0, end: 21, text: 'The original passage.', score: .8 });
        const output = renderEvidenceExtracts({ personal: [item] });
        expect(output).toContain('**You highlighted**'); expect(output).toContain('**Your note**');
        expect(html(output)).toContain('The original passage.');
        expect(html(output)).toContain('Verified written note: discipline and focus.');
    });
    it('renders stored Markdown, HTML and links literally without activating them', () => {
        const item = selectedPersonalEvidence();
        const text = '[click](https://evil.test) ![image](https://evil.test/a) <img src=x> **bold** `code` &copy;\n# Heading';
        if (item.evidence.type !== 'highlight') throw new Error('fixture');
        item.evidence.noteBody = text;
        item.evidence.source!.title = '[forged](https://evil.test)';
        item.spans = [{ field: 'noteBody', start: 0, end: text.length, text, score: .9 }];
        const output = html(renderEvidenceExtracts({ personal: [item] }));
        expect(output).not.toMatch(/<(a |img|h1|script)/);
        expect(output).toContain('**bold**'); expect(output).toContain('&amp;copy;');
        expect(output).toContain('&lt;img src=x&gt;');
    });
    it('marks a partial span and preserves Unicode without manufacturing context', () => {
        const item = selectedPersonalEvidence();
        if (item.evidence.type !== 'highlight') throw new Error('fixture');
        item.evidence.noteBody = 'Before. 🚀 Later. After.';
        item.spans = [{ field: 'noteBody', start: 8, end: 17, text: '🚀 Later.', score: .9 }];
        const output = renderEvidenceExtracts({ personal: [item] });
        expect(output).toContain('Your note (excerpt)'); expect(html(output)).toContain('🚀 Later.');
        expect(output).not.toContain('Before.');
    });
    it('refuses stale or fabricated span text', () => {
        const item = selectedPersonalEvidence(); item.spans[0].text = 'A made-up claim';
        expect(() => renderEvidenceExtracts({ personal: [item] })).toThrow('Invalid extract span');
    });
    it('does not present the reflection prompt as saved answer evidence', () => {
        const base = selectedPersonalEvidence();
        const text = 'I turned the whole sheet over.';
        const item = { ...base, evidence: { ...base.evidence, type: 'reflection' as const, reflectionText: text, prompt: 'Why did this cure everything?' },
            spans: [{ field: 'reflectionText' as const, start: 0, end: text.length, text, score: .9 }] };
        const output = renderEvidenceExtracts({ personal: [item] });
        expect(output).toContain('Your reflection'); expect(output).not.toContain('cure');
    });
    it('does not expose unavailable source metadata', () => {
        const item = selectedPersonalEvidence(); item.evidence.sourceStatus = 'unavailable';
        const output = renderEvidenceExtracts({ personal: [item] });
        expect(output).toContain('Source unavailable'); expect(output).not.toContain('Saved source');
    });
    it('honors the final composition IDs, excluding omitted selected records', () => {
        const output = renderEvidenceExtracts({ personal: [selectedPersonalEvidence()], evidenceIds: ['source:x'],
            sources: [{ type: 'source_segment', id: 'x', evidenceId: 'source:x', contentItemId: 'x', title: 'Editorial',
                text: 'Source words', fingerprint: 'x', score: .8, span: { start: 0, end: 12, text: 'Source words' } }] });
        expect(output).toContain('Editorial passage'); expect(output).not.toContain('Your note');
    });
    it('fails closed on missing or repeated identities', () => {
        expect(() => renderEvidenceExtracts({ personal: [], evidenceIds: ['missing'] })).toThrow();
        expect(() => renderEvidenceExtracts({ personal: [selectedPersonalEvidence()], evidenceIds: ['highlight:owned', 'highlight:owned'] })).toThrow();
    });
});
