import { filterEligibleBugbotResolutionIds } from '../bugbot_resolution_eligibility_policy';

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
