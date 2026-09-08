import {
    hasManagedPullRequestDescription,
    mergeManagedPullRequestDescription,
    normalizePullRequestDescriptionMode,
    renderManagedPullRequestDescription,
    shouldAutomaticallyUpdatePullRequestDescription,
} from '../pull_request_description';

describe('pull request description policy', () => {
    it('defaults missing or invalid modes to replace', () => {
        expect(normalizePullRequestDescriptionMode(undefined)).toBe('replace');
        expect(normalizePullRequestDescriptionMode('unknown')).toBe('replace');
        expect(normalizePullRequestDescriptionMode(' APPEND ')).toBe('append');
    });

    it('appends a managed section without changing human content', () => {
        const result = mergeManagedPullRequestDescription('Human summary', 'Generated details');
        expect(result).toBe(`Human summary\n\n${renderManagedPullRequestDescription('Generated details')}`);
    });

    it('renders only the managed section when no human body exists', () => {
        const result = mergeManagedPullRequestDescription(undefined, 'Generated details');
        expect(result).toBe(renderManagedPullRequestDescription('Generated details'));
        expect(hasManagedPullRequestDescription(result)).toBe(true);
        expect(hasManagedPullRequestDescription(null)).toBe(false);
        expect(hasManagedPullRequestDescription('Human summary')).toBe(false);
    });

    it('replaces only the existing managed section', () => {
        const original = mergeManagedPullRequestDescription('Human summary', 'Old details');
        expect(mergeManagedPullRequestDescription(original, 'New details')).toBe(
            `Human summary\n\n${renderManagedPullRequestDescription('New details')}`,
        );
    });

    it.each([
        ['replace', true],
        ['append', true],
        ['preserve', false],
        ['disabled', false],
    ] as const)('defines automatic ownership for %s mode', (mode, expected) => {
        expect(shouldAutomaticallyUpdatePullRequestDescription(mode)).toBe(expected);
    });
});
