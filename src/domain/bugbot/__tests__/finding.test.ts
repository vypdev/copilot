import {
    findExistingFindingInfo,
    findExistingFindingMatch,
    retainExistingFindingIds,
    isExistingFindingFullyResolved,
} from '../finding';

describe('finding identity reconciliation', () => {
    const retained = { pullRequest: { commentIdentity: 'PRRC_old', pullRequestNumber: 2,
        resolved: false, fingerprint: 'fp-11111111', semanticFingerprint: 'sf-11111111' } };
    const report = { id: 'new', title: 'New title', description: 'Still defective',
        fingerprint: 'fp-22222222', semanticFingerprint: 'sf-11111111' };

    it('returns the durable key as well as the matched destination', () => {
        expect(findExistingFindingMatch({ old: retained }, report)).toEqual({ id: 'old', info: retained });
    });

    it('preserves the durable ID and current evidence without mutating the model response', () => {
        expect(retainExistingFindingIds([report], { old: retained })).toEqual([{ ...report, id: 'old' }]);
        expect(report.id).toBe('new');
    });

    it('folds multiple reports only when they uniquely match one retained finding', () => {
        const duplicate = { ...report, id: 'another', title: 'Rephrased' };
        expect(retainExistingFindingIds([report, duplicate], { old: retained })).toEqual([{ ...report, id: 'old' }]);
    });

    it('keeps unmatched and ambiguous reports independent rather than choosing a destination', () => {
        const reports = [report, { ...report, id: 'another' }];
        expect(retainExistingFindingIds(reports, {})).toEqual(reports);
        expect(retainExistingFindingIds(reports, { first: retained, second: retained })).toEqual(reports);
    });

    it('does not choose the first location match or bypass ambiguity with a semantic fallback', () => {
        const other = { issue: { commentId: 3, resolved: false, fingerprint: 'fp-11111111' } };
        expect(findExistingFindingMatch({ first: retained, second: other }, {
            ...report, fingerprint: 'fp-11111111',
        })).toBeUndefined();
    });

    it('retains a compatible direct ID even when another record has similar semantics', () => {
        const direct = { ...report, id: 'old' };
        expect(retainExistingFindingIds([direct], { old: retained, second: retained })[0]).toBe(direct);
    });

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
