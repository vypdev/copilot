import {
    buildBugbotCommitMessage,
    buildFindingIdsPartForCommit,
    buildUserRequestCommitMessage,
    sanitizeFindingIdForCommitMessage,
} from '../commit_message_policy';

describe('commit message policy', () => {
    it('sanitizes control characters and bounds finding ids', () => {
        expect(sanitizeFindingIdForCommitMessage(' finding\n\u0001 ')).toBe('finding');
        expect(sanitizeFindingIdForCommitMessage('x'.repeat(100))).toHaveLength(80);
    });

    it('builds bounded finding segments and fallback text', () => {
        expect(buildFindingIdsPartForCommit([])).toBe('reported findings');
        expect(buildFindingIdsPartForCommit(['one', 'two'])).toBe('one, two');
        expect(buildFindingIdsPartForCommit(Array.from({ length: 10 }, () => 'x'.repeat(80))).endsWith('...')).toBe(true);
    });

    it('builds bugbot and user-request messages', () => {
        expect(buildBugbotCommitMessage(42, ['finding-1'])).toBe('fix(#42): bugbot autofix - resolve finding-1');
        expect(buildBugbotCommitMessage(0, [])).toBe('fix: bugbot autofix - resolve reported findings');
        expect(buildUserRequestCommitMessage(42)).toBe('chore(#42): apply user request');
        expect(buildUserRequestCommitMessage(0)).toBe('chore: apply user request');
    });
});
