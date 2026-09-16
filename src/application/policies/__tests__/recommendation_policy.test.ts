import {
    createIssueDescriptionFingerprint,
    createRecommendationFingerprint,
    getVisibleIssueDescription,
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
});
