import { resolveIssueTitleEmoji, resolvePullRequestTitleEmoji } from '../issue_emoji_policy';

const labels = (overrides: Record<string, boolean> = {}) => ({
    containsBranchedLabel: false,
    isHotfix: false,
    isRelease: false,
    isBugfix: false,
    isBug: false,
    isFeature: false,
    isEnhancement: false,
    isDocs: false,
    isDocumentation: false,
    isChore: false,
    isMaintenance: false,
    isHelp: false,
    isQuestion: false,
    ...overrides,
}) as never;

describe('issue emoji policy', () => {
    it('keeps branched issue emoji and branch marker', () => {
        expect(resolveIssueTitleEmoji(labels({ isHotfix: true }), true, '🌿')).toBe('🔥🌿');
        expect(resolveIssueTitleEmoji(labels({ isHelp: true }), false, '🌿')).toBe('🆘');
    });

    it('preserves pull-request precedence for bug labels', () => {
        expect(resolvePullRequestTitleEmoji(labels({ isBug: true, isDocs: true }), false, '🌿')).toBe('🐛');
    });
});
