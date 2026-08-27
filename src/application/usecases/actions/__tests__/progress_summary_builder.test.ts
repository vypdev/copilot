import { buildProgressSummaryMessage, isReasoningLikelyTruncated } from '../progress_summary_builder';

describe('progress summary builder', () => {
    it('includes remaining work and reasoning truncation note', () => {
        const message = buildProgressSummaryMessage({ summary: 'Half done', progress: 50, remaining: 'Add tests', reasoning: 'The plan:' });
        expect(message).toContain('Add tests');
        expect(message).toContain('Reasoning may be truncated');
    });

    it('detects sentence-ending reasoning as complete', () => {
        expect(isReasoningLikelyTruncated('Completed successfully.')).toBe(false);
        expect(isReasoningLikelyTruncated('Still evaluating')).toBe(true);
    });
});
