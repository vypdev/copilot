import { resolveCommentAutomationRoute } from '../comment_automation_route_policy';

const fixPayload = { isFixRequest: true, targetFindingIds: ['finding'], context: { issueNumber: 1 } } as never;
const doPayload = { isDoRequest: true } as never;

describe('comment automation route policy', () => {
    it('routes authorized fix requests to autofix', () => {
        expect(resolveCommentAutomationRoute(fixPayload, true)).toBe('autofix');
    });

    it('routes authorized user requests to do-user-request', () => {
        expect(resolveCommentAutomationRoute(doPayload, true)).toBe('do-user-request');
    });

    it('routes unauthorized file modifications to think', () => {
        expect(resolveCommentAutomationRoute(fixPayload, false)).toBe('think');
        expect(resolveCommentAutomationRoute(doPayload, false)).toBe('think');
    });

    it('routes non-modifying comments to think', () => {
        expect(resolveCommentAutomationRoute(undefined, true)).toBe('think');
    });
});
