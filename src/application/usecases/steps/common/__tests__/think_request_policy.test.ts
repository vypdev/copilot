import { resolveThinkRequest } from '../think_request_policy';

function baseParam(overrides: Record<string, unknown> = {}) {
    return {
        issue: { isIssueComment: true, commentBody: '/copilot review security', number: 7 },
        pullRequest: { isPullRequestReviewComment: false, commentBody: '', number: 0 },
        issueNumber: 7,
        tokenUser: undefined,
        ...overrides,
    } as never;
}

describe('think request policy', () => {
    it('accepts explicit Copilot commands without requiring a bot mention', () => {
        expect(resolveThinkRequest(baseParam())).toMatchObject({
            kind: 'ready',
            question: expect.stringContaining('/copilot review security'),
            destinationNumber: 7,
        });
    });

    it('keeps natural-language comments mention-gated', () => {
        expect(resolveThinkRequest(baseParam({ tokenUser: 'copilot', issue: { isIssueComment: true, commentBody: 'please review', number: 7 } }))).toMatchObject({
            kind: 'skip',
            reason: 'not-mentioned',
        });
    });
});
