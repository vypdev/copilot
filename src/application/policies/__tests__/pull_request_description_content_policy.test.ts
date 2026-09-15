import {
    MAX_PULL_REQUEST_DESCRIPTION_LENGTH,
    renderPullRequestDescriptionContent,
} from '../pull_request_description_content_policy';

const content = (overrides: Record<string, unknown> = {}) => ({
    outputLocale: 'en-US',
    overview: 'This keeps pull requests concise. Reviewers can now find the relevant evidence quickly.',
    whatChangedHeading: 'What changed',
    changes: ['Removed empty boilerplate.', 'Kept material reviewer context.'],
    validationHeading: 'Validation',
    validation: ['`pnpm test`'],
    reviewNotesHeading: null,
    reviewNotes: null,
    closesLinkedIssue: false,
    ...overrides,
});

describe('pull request description content policy', () => {
    it('renders the fixed information hierarchy without an empty optional section', () => {
        expect(renderPullRequestDescriptionContent(content(), 'en-US')).toEqual({
            kind: 'valid',
            markdown: [
                'This keeps pull requests concise. Reviewers can now find the relevant evidence quickly.',
                '## What changed\n\n- Removed empty boilerplate.\n- Kept material reviewer context.',
                '## Validation\n\n- `pnpm test`',
            ].join('\n\n'),
        });
    });

    it('renders localized headings, optional notes, and one trusted closing reference', () => {
        const result = renderPullRequestDescriptionContent(content({
            outputLocale: 'es-ES',
            overview: 'Este cambio reduce el ruido.',
            whatChangedHeading: 'Qué cambió',
            validationHeading: 'Validación',
            reviewNotesHeading: 'Notas para revisión',
            reviewNotes: ['La edición de metadatos ya no inicia el workflow.'],
            closesLinkedIssue: true,
        }), 'es-ES', 42);

        expect(result).toMatchObject({ kind: 'valid' });
        expect(result.kind === 'valid' && result.markdown).toContain('## Qué cambió');
        expect(result.kind === 'valid' && result.markdown).toContain('Closes #42');
    });

    it.each([
        ['missing fields', { validation: undefined }, 'shape'],
        ['additional fields', { untrusted: 'value' }, 'shape'],
        ['too few changes', { changes: ['Only one.'] }, 'shape'],
        ['blank content', { changes: [' ', 'Material change.'] }, 'unsafe-markdown'],
        ['notes without heading', { reviewNotes: ['Risk.'], reviewNotesHeading: null }, 'shape'],
        ['heading without notes', { reviewNotes: null, reviewNotesHeading: 'Review notes' }, 'shape'],
        ['closing without issue', { closesLinkedIssue: true }, 'shape'],
        ['more than three overview sentences', { overview: 'One. Two. Three. Four.' }, 'sentence-count'],
        ['more than three Japanese overview sentences', { overview: '一つです。二つです。三つです。四つです。' }, 'sentence-count'],
        ['heading injection', { changes: ['## Hidden section', 'Material change.'] }, 'unsafe-markdown'],
        ['multiline heading injection', { changes: ['Material change.\n## Hidden section', 'Another change.'] }, 'unsafe-markdown'],
        ['checkbox injection', { validation: ['- [x] Trust me'] }, 'unsafe-markdown'],
        ['decorative emoji', { overview: 'This is concise 🚀.' }, 'unsafe-markdown'],
        ['duplicate changes', { changes: ['Same change.', 'same change.'] }, 'duplicate-item'],
    ])('rejects %s', (_label, overrides, reason) => {
        expect(renderPullRequestDescriptionContent(content(overrides), 'en-US')).toEqual({
            kind: 'invalid',
            reason,
        });
    });

    it('rejects a body that exceeds the hard publication budget', () => {
        const repeated = 'a'.repeat(999);
        const result = renderPullRequestDescriptionContent(content({
            overview: 'b'.repeat(1_500),
            changes: Array.from({ length: 6 }, (_, index) => `${index}${repeated}`),
            validation: Array.from({ length: 8 }, (_, index) => `${index}${repeated}`),
        }), 'en-US');

        expect(result).toEqual({ kind: 'invalid', reason: 'body-too-long' });
        expect(MAX_PULL_REQUEST_DESCRIPTION_LENGTH).toBe(12_000);
    });

    it('keeps a deterministic sentence-limit fallback when Intl.Segmenter is unavailable', () => {
        const originalSegmenter = (Intl as unknown as { Segmenter?: unknown }).Segmenter;
        Object.defineProperty(Intl, 'Segmenter', { configurable: true, value: undefined });
        try {
            expect(renderPullRequestDescriptionContent(content({
                overview: 'One. Two. Three. Four.',
            }), 'en-US')).toEqual({ kind: 'invalid', reason: 'sentence-count' });
            expect(renderPullRequestDescriptionContent(content({
                overview: 'A concise outcome without terminal punctuation',
            }), 'en-US')).toMatchObject({ kind: 'valid' });
        } finally {
            Object.defineProperty(Intl, 'Segmenter', { configurable: true, value: originalSegmenter });
        }
    });

    it('neutralizes mentions and slash commands before rendering', () => {
        const result = renderPullRequestDescriptionContent(content({
            changes: ['Notify @team.', '/deploy only after review.'],
        }), 'en-US');

        expect(result.kind === 'valid' && result.markdown).toContain('@\u200bteam');
        expect(result.kind === 'valid' && result.markdown).toContain('- \u200b/deploy');
    });
});
