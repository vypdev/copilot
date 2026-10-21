/**
 * Provider-neutral Bugbot finding and durable identity contracts.
 *
 * These types are shared by analysis, reconciliation, and publication. Keeping
 * them in the domain prevents policies from depending on a particular use-case
 * folder and gives every adapter one stable semantic vocabulary.
 */

export interface BugbotFinding {
  id: string;
  title: string;
  description: string;
  /** Computed locally; never accepted from the agent as an authority. */
  fingerprint?: string;
  /** Location-independent reconciliation identity computed locally. */
  semanticFingerprint?: string;
  file?: string;
  line?: number;
  endLine?: number;
  severity?: string;
  confidence?: number;
  category?: string;
  evidence?: string;
  suggestion?: string;
  /** Optional enclosing symbol used only to improve local identity. */
  symbol?: string;
  /** Short code anchor used only to improve local identity. */
  codeSnippet?: string;
  /** Exact replacement text for a suggested change, when safe and local. */
  suggestedCode?: string;
}

export type BugbotFindingResolution = 'fixed' | 'obsolete' | 'dismissed';

export interface ExistingIssueFindingInfo {
  commentId: number;
  resolved: boolean;
  fingerprint?: string;
  semanticFingerprint?: string;
  resolution?: BugbotFindingResolution;
}

export interface ExistingPullRequestFindingInfo {
  commentIdentity: string;
  pullRequestNumber: number;
  resolved: boolean;
  /** Fresh provider thread state when it was available. */
  threadResolved?: boolean;
  threadResolvedByLogin?: string;
  parentReviewIdentity?: string;
  url?: string;
  /** Explicitly non-clean when durable marker and native facts disagree. */
  verificationRequired?: boolean;
  fingerprint?: string;
  semanticFingerprint?: string;
  resolution?: BugbotFindingResolution;
}

/** Tracks each durable destination independently so partial failures remain retryable. */
export interface ExistingFindingInfo {
  issue?: ExistingIssueFindingInfo;
  pullRequest?: ExistingPullRequestFindingInfo;
}

export type ExistingByFindingId = Record<string, ExistingFindingInfo>;

export function isExistingFindingFullyResolved(
  finding: ExistingFindingInfo,
): boolean {
  const destinations = [finding.issue, finding.pullRequest].filter(
    (destination) => destination != null,
  );
  return (
    destinations.length > 0 &&
    destinations.every((destination) => destination.resolved) &&
    finding.pullRequest?.verificationRequired !== true
  );
}

export function findExistingFindingInfo(
  existingByFindingId: ExistingByFindingId,
  finding: Pick<BugbotFinding, 'id' | 'fingerprint' | 'semanticFingerprint'>,
): ExistingFindingInfo | undefined {
  return findExistingFindingMatch(existingByFindingId, finding)?.info;
}

/** A match carries its durable key so updating a comment cannot re-key it. */
export function findExistingFindingMatch(
  existingByFindingId: ExistingByFindingId,
  finding: Pick<BugbotFinding, 'id' | 'fingerprint' | 'semanticFingerprint'>,
): { id: string; info: ExistingFindingInfo } | undefined {
  const direct = existingByFindingId[finding.id];
  if (direct && identitiesAreCompatible(direct, finding)) return { id: finding.id, info: direct };
  const candidates = Object.entries(existingByFindingId);
  if (finding.fingerprint) {
    const locationMatches = candidates.filter(([, candidate]) =>
      candidate.issue?.fingerprint === finding.fingerprint
      || candidate.pullRequest?.fingerprint === finding.fingerprint,
    );
    if (locationMatches.length > 0) return uniqueFindingMatch(locationMatches);
  }
  if (!finding.semanticFingerprint) return undefined;
  const semanticMatches = candidates.filter(([, candidate]) =>
    candidate.issue?.semanticFingerprint === finding.semanticFingerprint
    || candidate.pullRequest?.semanticFingerprint === finding.semanticFingerprint,
  );
  return uniqueFindingMatch(semanticMatches);
}

/**
 * Preserve trusted IDs across title/location changes, before limits, publication
 * and final projection. Multiple reports of one uniquely matched durable finding
 * share one record; unmatched or ambiguous reports remain independent evidence.
 */
export function retainExistingFindingIds(
  findings: readonly BugbotFinding[],
  existingByFindingId: ExistingByFindingId,
): BugbotFinding[] {
  const retained = new Set<string>();
  return findings.flatMap((finding) => {
    const match = findExistingFindingMatch(existingByFindingId, finding);
    if (!match) return [finding];
    if (retained.has(match.id)) return [];
    retained.add(match.id);
    return [finding.id === match.id ? finding : { ...finding, id: match.id }];
  });
}

function uniqueFindingMatch(
  matches: Array<[string, ExistingFindingInfo]>,
): { id: string; info: ExistingFindingInfo } | undefined {
  return matches.length === 1 ? { id: matches[0][0], info: matches[0][1] } : undefined;
}

function identitiesAreCompatible(
  existing: ExistingFindingInfo,
  finding: Pick<BugbotFinding, 'fingerprint' | 'semanticFingerprint'>,
): boolean {
  const existingFingerprints = [
    existing.issue?.fingerprint,
    existing.pullRequest?.fingerprint,
  ].filter(Boolean);
  const existingSemanticFingerprints = [
    existing.issue?.semanticFingerprint,
    existing.pullRequest?.semanticFingerprint,
  ].filter(Boolean);
  return (finding.fingerprint !== undefined
      && existingFingerprints.includes(finding.fingerprint))
    || (finding.semanticFingerprint !== undefined
      && existingSemanticFingerprints.includes(finding.semanticFingerprint));
}
