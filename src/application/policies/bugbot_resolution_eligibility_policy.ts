import type { ExistingByFindingId } from '../../domain/bugbot/finding';

/**
 * Resolution is allowed only for prior findings retained in this run's prompt.
 * A user dismissal is durable and cannot be overwritten by an agent response.
 */
export function filterEligibleBugbotResolutionIds(
  claimedIds: ReadonlySet<string>,
  eligibleIds: ReadonlySet<string>,
  existingByFindingId: ExistingByFindingId,
): Set<string> {
  return new Set([...claimedIds].filter((findingId) => {
    if (!eligibleIds.has(findingId)) return false;
    const existing = existingByFindingId[findingId];
    return existing?.issue?.resolution !== 'dismissed'
      && existing?.pullRequest?.resolution !== 'dismissed';
  }));
}
