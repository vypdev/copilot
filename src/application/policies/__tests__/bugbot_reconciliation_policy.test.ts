import {
    buildBugbotReconciliationPlan,
    describeBugbotSnapshotFailures,
    findMissingNonCleanDurableFindingIds,
    reconcileResolvedFindingIds,
} from '../bugbot_reconciliation_policy';

describe('bugbot reconciliation policy', () => {
    it('builds a deterministic fail-closed plan without duplicating durable diagnostics', () => {
        const finding = { id: 'finding', title: 'Finding', description: 'Description' };
        const result = buildBugbotReconciliationPlan({
            providerProjection: {
                findings: [],
                observed: {
                    issueFindingIds: new Set(),
                    pullRequestFindingIds: new Set(),
                },
                malformedEvidence: false,
            },
            existingByFindingId: {
                finding: {
                    pullRequest: {
                        commentIdentity: 'PRRC_1',
                        pullRequestNumber: 10,
                        resolved: false,
                        parentReviewIdentity: '77',
                    },
                },
            },
            previousFindingTitles: new Map([['finding', 'Previous title']]),
            activeFindings: [finding],
            expectedPublishedFindings: [finding],
        });

        expect(result.findings).toEqual([expect.objectContaining({
            id: 'finding',
            state: 'unknown',
            title: 'Finding',
            parentReviewIdentity: '77',
        })]);
        expect(result.diagnostics).toEqual([
            'The final provider snapshot omitted 1 previously observed unresolved or unverified Bugbot finding(s).',
        ]);
    });

    it('retains active overflow findings as open without requiring publication evidence', () => {
        const visible = { id: 'visible', title: 'Visible', description: 'Description' };
        const overflow = { id: 'overflow', title: 'Overflow', description: 'Description' };
        const result = buildBugbotReconciliationPlan({
            providerProjection: {
                findings: [{ id: 'visible', title: 'Visible', state: 'open' }],
                observed: {
                    issueFindingIds: new Set(),
                    pullRequestFindingIds: new Set(['visible']),
                },
                malformedEvidence: false,
            },
            existingByFindingId: {},
            previousFindingTitles: new Map(),
            activeFindings: [visible, overflow],
            expectedPublishedFindings: [visible],
        });

        expect(result.findings).toEqual(expect.arrayContaining([
            expect.objectContaining({ id: 'visible', state: 'open' }),
            expect.objectContaining({ id: 'overflow', state: 'open' }),
        ]));
        expect(result.diagnostics).toEqual([]);
    });

    it('maps every failed snapshot surface in stable user-safe order', () => {
        expect(describeBugbotSnapshotFailures({
            linkedIssueComments: 'failed',
            pullRequestComments: 'failed',
            reviewThreads: 'failed',
            reviews: 'failed',
            conversation: 'failed',
            navigation: 'failed',
        })).toEqual([
            'Unable to re-read pull request review comments.',
            'Unable to re-read pull request review thread state.',
            'Unable to re-read pull request reviews.',
            'Unable to re-read the pull request conversation.',
            'Unable to re-read linked issue finding comments.',
            'Unable to build safe Bugbot navigation links.',
        ]);
    });

    it('does not report verified or inapplicable snapshot surfaces', () => {
        expect(describeBugbotSnapshotFailures({
            linkedIssueComments: 'not-applicable',
            pullRequestComments: 'verified',
            reviewThreads: 'verified',
            reviews: 'verified',
            conversation: 'verified',
            navigation: 'verified',
        })).toEqual([]);
    });

    it('finds absent durable findings with an unresolved issue or pull-request destination', () => {
        const missing = findMissingNonCleanDurableFindingIds(
            {
                issue: { issue: { commentId: 1, resolved: false } },
                pullRequest: {
                    pullRequest: {
                        commentIdentity: 'PRRC_1',
                        pullRequestNumber: 358,
                        resolved: false,
                    },
                },
            },
            { issueFindingIds: new Set(), pullRequestFindingIds: new Set() },
        );

        expect(missing).toEqual(['issue', 'pullRequest']);
    });

    it('finds an absent durable finding whose resolved evidence still requires verification', () => {
        const missing = findMissingNonCleanDurableFindingIds(
            {
                finding: {
                    pullRequest: {
                        commentIdentity: 'PRRC_1',
                        pullRequestNumber: 358,
                        resolved: true,
                        verificationRequired: true,
                    },
                },
            },
            { issueFindingIds: new Set(), pullRequestFindingIds: new Set() },
        );

        expect(missing).toEqual(['finding']);
    });

    it('ignores observed, fully resolved, and destination-less durable entries', () => {
        const missing = findMissingNonCleanDurableFindingIds(
            {
                observed: { issue: { commentId: 1, resolved: false } },
                resolved: {
                    issue: { commentId: 2, resolved: true },
                    pullRequest: {
                        commentIdentity: 'PRRC_2',
                        pullRequestNumber: 358,
                        resolved: true,
                    },
                },
                empty: {},
            },
            {
                issueFindingIds: new Set(['observed']),
                pullRequestFindingIds: new Set(),
            },
        );

        expect(missing).toEqual([]);
    });

    it('requires every non-clean destination to be present independently', () => {
        const existing = {
            finding: {
                issue: { commentId: 1, resolved: false },
                pullRequest: {
                    commentIdentity: 'PRRC_1',
                    pullRequestNumber: 358,
                    resolved: false,
                },
            },
        };

        expect(findMissingNonCleanDurableFindingIds(existing, {
            issueFindingIds: new Set(['finding']),
            pullRequestFindingIds: new Set(),
        })).toEqual(['finding']);
        expect(findMissingNonCleanDurableFindingIds(existing, {
            issueFindingIds: new Set(),
            pullRequestFindingIds: new Set(['finding']),
        })).toEqual(['finding']);
        expect(findMissingNonCleanDurableFindingIds(existing, {
            issueFindingIds: new Set(['finding']),
            pullRequestFindingIds: new Set(['finding']),
        })).toEqual([]);
    });

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

    it('does not resolve a previous id when its fingerprint is still active', () => {
        const resolved = reconcileResolvedFindingIds(
            new Set(['old-id']),
            { 'old-id': { issue: { commentId: 1, resolved: false, fingerprint: 'fp-12345678' } } },
            [{ id: 'new-id', title: 'Same finding', description: 'Still present', fingerprint: 'fp-12345678' }],
        );

        expect(resolved).toEqual(new Set());
    });

    it('does not resolve a finding that moved when its semantic fingerprint remains active', () => {
        const resolved = reconcileResolvedFindingIds(
            new Set(['old-id']),
            { 'old-id': { issue: { commentId: 1, resolved: false, semanticFingerprint: 'sf-12345678' } } },
            [{ id: 'new-id', title: 'Moved finding', description: 'Still present', semanticFingerprint: 'sf-12345678' }],
        );
        expect(resolved).toEqual(new Set());
    });
});
