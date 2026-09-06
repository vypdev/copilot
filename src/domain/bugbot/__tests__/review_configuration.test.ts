import {
    normalizeBugbotReviewConfiguration,
    resolveBugbotReviewEffort,
    parseBugbotOrganizationRules,
} from '../review_configuration';

describe('Bugbot review configuration', () => {
    it('normalizes unsafe or unknown values to conservative defaults', () => {
        expect(normalizeBugbotReviewConfiguration({
            publicationMode: 'invalid' as never,
            effort: 'maximum' as never,
            organizationRules: ['  require tests  ', '', 'never leak credentials'],
        })).toEqual(expect.objectContaining({
            publicationMode: 'publish',
            effort: 'default',
            reviewDrafts: false,
            suggestedChanges: true,
            organizationRules: ['require tests', 'never leak credentials'],
        }));
    });

    it('preserves commas inside organization rules and accepts line or semicolon separators', () => {
        expect(parseBugbotOrganizationRules('Check auth, tenancy, and scopes;Require tests\nAvoid global state')).toEqual([
            'Check auth, tenancy, and scopes',
            'Require tests',
            'Avoid global state',
        ]);
    });

    it('resolves smart effort deterministically from risk and change size', () => {
        expect(resolveBugbotReviewEffort('smart', { files: 1, additions: 10, deletions: 2 })).toBe('low');
        expect(resolveBugbotReviewEffort('smart', { files: 0, additions: 0, deletions: 0 })).toBe('default');
        expect(resolveBugbotReviewEffort('smart', { files: 4, additions: 120, deletions: 20 })).toBe('default');
        expect(resolveBugbotReviewEffort('smart', { files: 1, additions: 2, deletions: 1, touchesSensitivePath: true })).toBe('high');
    });
});
