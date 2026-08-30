import { reconcileResolvedFindingIds } from '../bugbot_reconciliation_policy';

describe('bugbot reconciliation policy', () => {
    it('accepts only existing findings that are no longer active', () => {
        const resolved = reconcileResolvedFindingIds(
            new Set(['gone', 'still-active', 'unknown']),
            {
                gone: { issue: { commentId: 1, resolved: false } },
                'still-active': { issue: { commentId: 2, resolved: false } },
            },
            [{ id: 'still-active', title: 'Still active', description: 'Present' }],
        );

        expect(resolved).toEqual(new Set(['gone']));
    });

    it('does not resolve a legacy id when its fingerprint is still active', () => {
        const resolved = reconcileResolvedFindingIds(
            new Set(['old-id']),
            { 'old-id': { issue: { commentId: 1, resolved: false, fingerprint: 'fp-12345678' } } },
            [{ id: 'new-id', title: 'Same finding', description: 'Still present', fingerprint: 'fp-12345678' }],
        );

        expect(resolved).toEqual(new Set());
    });
});
