import { resolveMainRunRoute } from '../main_run_route';

const base = {
    isSingleAction: false,
    isIssue: false,
    isIssueComment: false,
    isPullRequest: false,
    isPullRequestReviewComment: false,
    isPush: false,
};

describe('resolveMainRunRoute', () => {
    it.each([
        ['single-action', { isSingleAction: true }],
        ['issue-comment', { isIssue: true, isIssueComment: true }],
        ['issue', { isIssue: true }],
        ['pull-request-review-comment', { isPullRequest: true, isPullRequestReviewComment: true }],
        ['pull-request', { isPullRequest: true }],
        ['push', { isPush: true }],
        ['unhandled', {}],
    ] as const)('resolves %s', (expected, input) => {
        expect(resolveMainRunRoute({ ...base, ...input })).toBe(expected);
    });

    it('preserves the existing event priority', () => {
        expect(resolveMainRunRoute({
            ...base,
            isSingleAction: true,
            isIssue: true,
            isPullRequest: true,
            isPush: true,
        })).toBe('single-action');
        expect(resolveMainRunRoute({
            ...base,
            isIssue: true,
            isPullRequest: true,
            isPush: true,
        })).toBe('issue');
        expect(resolveMainRunRoute({ ...base, isPullRequest: true, isPush: true })).toBe('pull-request');
    });
});
