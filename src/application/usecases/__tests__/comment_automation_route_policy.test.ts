import { resolveCommentAutomationRoute } from '../comment_automation_route_policy';

const fixPayload = { isFixRequest: true, targetFindingIds: ['finding'], context: { issueNumber: 1 } } as never;
const doPayload = { isDoRequest: true } as never;
const reviewPayload = { isReviewRequest: true } as never;

describe('comment automation route policy', () => {
    it('routes authorized fix requests to autofix', () => {
        expect(resolveCommentAutomationRoute(fixPayload, true, true)).toBe('autofix');
    });

    it('routes authorized user requests to do-user-request', () => {
        expect(resolveCommentAutomationRoute(doPayload, true, true)).toBe('do-user-request');
    });

    it('routes a mentioned review request to the read-only review route', () => {
        expect(resolveCommentAutomationRoute(reviewPayload, false, true)).toBe('review');
        expect(resolveCommentAutomationRoute(reviewPayload, true, false)).toBe('think');
    });

    it('routes unauthorized file modifications to think', () => {
        expect(resolveCommentAutomationRoute(fixPayload, false)).toBe('think');
        expect(resolveCommentAutomationRoute(doPayload, false)).toBe('think');
    });

    it('does not route an unmentioned natural-language request to a file-changing action', () => {
        expect(resolveCommentAutomationRoute(doPayload, true, false)).toBe('think');
    });

    it('allows an explicit mutation command without a bot mention', () => {
        expect(resolveCommentAutomationRoute(doPayload, true, false, true)).toBe('do-user-request');
    });

    it('routes non-modifying comments to think', () => {
        expect(resolveCommentAutomationRoute(undefined, true)).toBe('think');
    });
});
