import { findExistingFindingInfo } from '../types';

describe('finding identity reconciliation', () => {
    it('prefers the exact id and falls back to the locally computed fingerprint', () => {
        const exact = { issue: { commentId: 1, resolved: false, fingerprint: 'fp-11111111' } };
        const fallback = { pullRequest: { commentIdentity: 'review-1', pullRequestNumber: 2, resolved: false, fingerprint: 'fp-22222222' } };
        const existing = { old: fallback, current: exact };

        expect(findExistingFindingInfo(existing, { id: 'current', fingerprint: 'fp-22222222' })).toBe(exact);
        expect(findExistingFindingInfo(existing, { id: 'new-id', fingerprint: 'fp-22222222' })).toBe(fallback);
        expect(findExistingFindingInfo(existing, { id: 'missing' })).toBeUndefined();
    });
});
