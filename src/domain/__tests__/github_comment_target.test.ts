import { isPullRequestConversationComment } from '../github_comment_target';

describe('GitHub comment target policy', () => {
    it('accepts only an issue-comment event with an object PR marker', () => {
        expect(isPullRequestConversationComment({
            eventName: 'issue_comment',
            issue: { pull_request: { url: 'https://api.github.com/repos/o/r/pulls/42' } },
        })).toBe(true);
    });

    it.each([
        undefined,
        {},
        { eventName: 'issues', issue: { pull_request: {} } },
        { eventName: 'issue_comment' },
        { eventName: 'issue_comment', issue: { pull_request: null } },
        { eventName: 'issue_comment', issue: { pull_request: false } },
        { eventName: 'issue_comment', issue: { pull_request: 'invalid' } },
        { eventName: 'issue_comment', issue: { pull_request: [] } },
    ])('rejects a non-authoritative PR marker: %j', (input) => {
        expect(isPullRequestConversationComment(input as never)).toBe(false);
    });
});
