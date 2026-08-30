import { projectBugbotFindingStatuses } from '../bugbot_finding_status_policy';

describe('projectBugbotFindingStatuses', () => {
    it('distinguishes open, fixed, obsolete, dismissed and reopened findings', () => {
        const result = projectBugbotFindingStatuses(
            {
                open: { issue: { commentId: 1, resolved: false } },
                fixed: { issue: { commentId: 2, resolved: true, resolution: 'fixed' } },
                obsolete: { issue: { commentId: 3, resolved: true, resolution: 'obsolete' } },
                dismissed: { issue: { commentId: 4, resolved: true, resolution: 'dismissed' } },
                reopened: { issue: { commentId: 5, resolved: true, resolution: 'fixed' } },
            },
            [{ id: 'open', title: 'Open', description: 'Still open' }, { id: 'reopened', title: 'Reopened', description: 'Back' }],
            new Set(['fixed', 'obsolete', 'dismissed']),
        );

        expect(Object.fromEntries(result.statuses)).toEqual({
            open: 'open',
            fixed: 'fixed',
            obsolete: 'obsolete',
            dismissed: 'dismissed',
            reopened: 'reopened',
        });
        expect(result.counts).toEqual({ open: 1, fixed: 1, obsolete: 1, dismissed: 1, reopened: 1 });
    });
});
