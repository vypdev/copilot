import {
    createIssueDescriptionFingerprint,
    createRecommendationFingerprint,
    getVisibleIssueDescription,
    isNoNewRecommendation,
    limitStoredRecommendation,
    MAX_STORED_RECOMMENDATION_LENGTH,
} from '../recommendation_policy';

describe('recommendation policy', () => {
    it('removes visible and hidden Copilot blocks from issue descriptions', () => {
        const description = 'Requirement\n\n<!-- copilot-configuration-start\n{}\ncopilot-configuration-end -->\n\n<!-- copilot-answer-start -->hidden<!-- copilot-answer-end -->';

        expect(getVisibleIssueDescription(description)).toBe('Requirement');
    });

    it('ignores line endings, trailing spaces and extra blank lines in fingerprints', () => {
        expect(createIssueDescriptionFingerprint('A\n\nB  ')).toBe(createIssueDescriptionFingerprint('A\r\n\r\nB'));
        expect(createRecommendationFingerprint('1. A\n\n\n2. B')).toBe(createRecommendationFingerprint('1. A\n\n2. B'));
    });

    it('recognizes the no-new-recommendations sentinel with an optional code fence', () => {
        expect(isNoNewRecommendation('```text\nNO_NEW_RECOMMENDATIONS\n```')).toBe(true);
        expect(isNoNewRecommendation('NO_NEW_RECOMMENDATIONS\nMore text')).toBe(false);
    });

    it('limits stored recommendation metadata without changing shorter content', () => {
        const short = '1. Test';
        expect(limitStoredRecommendation(short)).toBe(short);
        expect(limitStoredRecommendation('x'.repeat(MAX_STORED_RECOMMENDATION_LENGTH + 1))).toContain('[Recommendation truncated');
    });
});
