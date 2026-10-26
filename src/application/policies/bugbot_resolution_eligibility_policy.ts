import type { ExistingByFindingId, ExistingFindingInfo, ExistingPullRequestFindingInfo } from '../../domain/bugbot/finding';

/**
 * Resolution is allowed only for prior findings retained in this run's prompt.
 * A user dismissal stays protected until its native thread is explicitly reopened.
 */
export function filterEligibleBugbotResolutionIds(
  claimedIds: ReadonlySet<string>,
  eligibleIds: ReadonlySet<string>,
  existingByFindingId: ExistingByFindingId,
): Set<string> {
  return new Set([...claimedIds].filter((findingId) => {
    if (!eligibleIds.has(findingId)) return false;
    const existing = existingByFindingId[findingId];
    return !hasProtectedBugbotDismissal(existing);
  }));
}

/** Native reopening withdraws only this trusted PR destination's dismissal. */
export function isReopenedBugbotDismissal(finding: ExistingPullRequestFindingInfo | undefined): boolean {
  return finding?.resolution === 'dismissed' && finding.resolved
    && finding.threadResolved === false && finding.verificationRequired === true;
}

export function hasProtectedBugbotDismissal(finding: ExistingFindingInfo | undefined): boolean {
  return finding?.issue?.resolution === 'dismissed'
    || (finding?.pullRequest?.resolution === 'dismissed' && !isReopenedBugbotDismissal(finding.pullRequest));
}
