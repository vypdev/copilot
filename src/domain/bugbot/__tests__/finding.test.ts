import {
    findExistingFindingInfo,
    isExistingFindingFullyResolved,
} from '../finding';

describe('finding identity reconciliation', () => {
    it('requires a compatible local identity before trusting an exact model id', () => {
        const exact = { issue: { commentId: 1, resolved: false, fingerprint: 'fp-11111111' } };
        const fallback = { pullRequest: { commentIdentity: 'review-1', pullRequestNumber: 2, resolved: false, fingerprint: 'fp-22222222' } };
        const existing = { old: fallback, current: exact };

        expect(findExistingFindingInfo(existing, { id: 'current', fingerprint: 'fp-22222222' })).toBe(fallback);
        expect(findExistingFindingInfo(existing, { id: 'current', fingerprint: 'fp-11111111' })).toBe(exact);
        expect(findExistingFindingInfo(existing, { id: 'new-id', fingerprint: 'fp-22222222' })).toBe(fallback);
        expect(findExistingFindingInfo(existing, { id: 'missing' })).toBeUndefined();
    });

    it('falls back to semantic identity after a file rename', () => {
        const fallback = { pullRequest: { commentIdentity: 'review-2', pullRequestNumber: 2, resolved: false, semanticFingerprint: 'sf-22222222' } };
        expect(findExistingFindingInfo({ old: fallback }, {
            id: 'renamed',
            fingerprint: 'fp-99999999',
            semanticFingerprint: 'sf-22222222',
        })).toBe(fallback);
    });

    it('refuses an ambiguous semantic fallback', () => {
        const first = { issue: { commentId: 1, resolved: false, semanticFingerprint: 'sf-22222222' } };
        const second = { issue: { commentId: 2, resolved: false, semanticFingerprint: 'sf-22222222' } };

        expect(findExistingFindingInfo({ first, second }, {
            id: 'renamed',
            fingerprint: 'fp-99999999',
            semanticFingerprint: 'sf-22222222',
        })).toBeUndefined();
    });
});

describe('isExistingFindingFullyResolved', () => {
    it('requires at least one durable destination and every destination resolved', () => {
        expect(isExistingFindingFullyResolved({})).toBe(false);
        expect(isExistingFindingFullyResolved({
            issue: { commentId: 1, resolved: true },
        })).toBe(true);
        expect(isExistingFindingFullyResolved({
            issue: { commentId: 1, resolved: true },
            pullRequest: {
                commentIdentity: 'PRRC_1',
                pullRequestNumber: 10,
                resolved: false,
            },
        })).toBe(false);
    });

    it('keeps verification-required pull-request destinations non-clean', () => {
        expect(isExistingFindingFullyResolved({
            pullRequest: {
                commentIdentity: 'PRRC_1',
                pullRequestNumber: 10,
                resolved: true,
                verificationRequired: true,
            },
        })).toBe(false);
    });

    it('matches direct semantic identity stored on a pull-request destination', () => {
        const existing = {
            pullRequest: {
                commentIdentity: 'PRRC_1',
                pullRequestNumber: 10,
                resolved: false,
                semanticFingerprint: 'sf-11111111',
            },
        };
        expect(findExistingFindingInfo({ finding: existing }, {
            id: 'finding',
            semanticFingerprint: 'sf-11111111',
        })).toBe(existing);
    });
});
