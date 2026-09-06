import {
    mergeManagedPullRequestDescription,
    normalizePullRequestDescriptionMode,
    renderManagedPullRequestDescription,
} from '../pull_request_description';

describe('pull request description policy', () => {
    it('defaults invalid modes to replace', () => {
        expect(normalizePullRequestDescriptionMode('unknown')).toBe('replace');
        expect(normalizePullRequestDescriptionMode(' APPEND ')).toBe('append');
    });

    it('appends a managed section without changing human content', () => {
        const result = mergeManagedPullRequestDescription('Human summary', 'Generated details');
        expect(result).toBe(`Human summary\n\n${renderManagedPullRequestDescription('Generated details')}`);
    });

    it('replaces only the existing managed section', () => {
        const original = mergeManagedPullRequestDescription('Human summary', 'Old details');
        expect(mergeManagedPullRequestDescription(original, 'New details')).toBe(
            `Human summary\n\n${renderManagedPullRequestDescription('New details')}`,
        );
    });
});
