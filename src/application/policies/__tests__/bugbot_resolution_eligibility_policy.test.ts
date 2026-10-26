import { filterEligibleBugbotResolutionIds, isReopenedBugbotDismissal, hasProtectedBugbotDismissal } from '../bugbot_resolution_eligibility_policy';

describe('Bugbot resolution eligibility policy', () => {
  it('keeps only retained, non-dismissed finding IDs', () => {
    const filtered = filterEligibleBugbotResolutionIds(
      new Set(['eligible', 'omitted', 'issue-dismissed', 'pr-dismissed']),
      new Set(['eligible', 'issue-dismissed', 'pr-dismissed']),
      {
        eligible: { issue: { commentId: 1, resolved: false } },
        'issue-dismissed': { issue: { commentId: 2, resolved: true, resolution: 'dismissed' } },
        'pr-dismissed': { pullRequest: { commentIdentity: '3', pullRequestNumber: 7, resolved: true, resolution: 'dismissed' } },
      },
    );

    expect([...filtered]).toEqual(['eligible']);
  });

  it('accepts a retained ID with no existing provider projection', () => {
    expect(filterEligibleBugbotResolutionIds(
      new Set(['eligible']),
      new Set(['eligible']),
      {},
    )).toEqual(new Set(['eligible']));
  });
});


describe('withdrawn native dismissals', () => {
  const reopened = { commentIdentity: 'PRRC_1', pullRequestNumber: 7, resolved: true,
    resolution: 'dismissed' as const, threadResolved: false, verificationRequired: true };

  it('retains resolution authority only for an observed, included native reopening', () => {
    const existing = { old: { pullRequest: reopened } };
    expect(filterEligibleBugbotResolutionIds(new Set(['old']), new Set(['old']), existing)).toEqual(new Set(['old']));
    expect(filterEligibleBugbotResolutionIds(new Set(['old']), new Set(), existing)).toEqual(new Set());
  });

  it.each([
    undefined,
    { ...reopened, resolution: 'fixed' as const },
    { ...reopened, resolved: false },
    { ...reopened, threadResolved: undefined },
    { ...reopened, threadResolved: true },
    { ...reopened, verificationRequired: undefined },
  ])('does not infer native dismissal withdrawal from incomplete or different evidence: %j', finding => {
    expect(isReopenedBugbotDismissal(finding)).toBe(false);
  });

  it('preserves a separate issue-comment dismissal when the PR dismissal is withdrawn', () => {
    const existing = { old: { pullRequest: reopened,
      issue: { commentId: 2, resolved: true, resolution: 'dismissed' as const } } };
    expect(hasProtectedBugbotDismissal(existing.old)).toBe(true);
    expect(filterEligibleBugbotResolutionIds(new Set(['old']), new Set(['old']), existing)).toEqual(new Set());
  });
});
