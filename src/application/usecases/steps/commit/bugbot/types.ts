/**
 * Bugbot types: data structures used across detection, publishing, and autofix.
 * GitHub supplies the canonical PR diff and the configured agent can inspect
 * the read-only workspace for context before returning findings.
 */

/** Single finding from the configured findings agent. */
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
  /** Exact replacement text for a GitHub suggested change, when safe and local. */
  suggestedCode?: string;
}

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
  /** Fresh GitHub thread state when the provider supplied it. */
  threadResolved?: boolean;
  fingerprint?: string;
  semanticFingerprint?: string;
  resolution?: BugbotFindingResolution;
}

export type BugbotFindingResolution = 'fixed' | 'obsolete' | 'dismissed';

/** Tracks each published destination independently so partial failures remain retryable. */
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
    destinations.every((destination) => destination.resolved)
  );
}

/** PR metadata used only when publishing findings to GitHub. */
export interface BugbotPrContext {
  prHeadSha: string;
  prFiles: Array<{ filename: string; status: string }>;
  pathToFirstDiffLine: Record<string, number>;
  pathToDiffLocations?: Record<string, Array<{ line: number; side: 'LEFT' | 'RIGHT' }>>;
  changes?: Array<{
    filename: string;
    status: string;
    additions: number;
    deletions: number;
    patch: string;
  }>;
}

/** Unresolved finding with a prompt-bounded comment body. */
export interface UnresolvedFindingWithBody {
  id: string;
  fullBody: string;
}

/** Finding projection used by prompts that ask the agent to select findings. */
export interface UnresolvedFindingSummary {
  id: string;
  title: string;
  description?: string;
  file?: string;
  line?: number;
}

export function findExistingFindingInfo(
  existingByFindingId: ExistingByFindingId,
  finding: Pick<BugbotFinding, 'id' | 'fingerprint' | 'semanticFingerprint'>,
): ExistingFindingInfo | undefined {
  const direct = existingByFindingId[finding.id];
  if (direct && identitiesAreCompatible(direct, finding)) return direct;
  const candidates = Object.values(existingByFindingId);
  if (finding.fingerprint) {
    const locationMatch = candidates.find((candidate) =>
      candidate.issue?.fingerprint === finding.fingerprint
      || candidate.pullRequest?.fingerprint === finding.fingerprint,
    );
    if (locationMatch) return locationMatch;
  }
  if (!finding.semanticFingerprint) return undefined;
  const semanticMatches = candidates.filter((candidate) =>
    candidate.issue?.semanticFingerprint === finding.semanticFingerprint
    || candidate.pullRequest?.semanticFingerprint === finding.semanticFingerprint,
  );
  return semanticMatches.length === 1 ? semanticMatches[0] : undefined;
}

function identitiesAreCompatible(
  existing: ExistingFindingInfo,
  finding: Pick<BugbotFinding, 'fingerprint' | 'semanticFingerprint'>,
): boolean {
  const existingFingerprints = [existing.issue?.fingerprint, existing.pullRequest?.fingerprint].filter(Boolean);
  const existingSemanticFingerprints = [
    existing.issue?.semanticFingerprint,
    existing.pullRequest?.semanticFingerprint,
  ].filter(Boolean);
  // Legacy markers had no local identities, so preserve their exact-id migration path.
  if (existingFingerprints.length === 0 && existingSemanticFingerprints.length === 0) return true;
  return (finding.fingerprint !== undefined && existingFingerprints.includes(finding.fingerprint))
    || (finding.semanticFingerprint !== undefined
      && existingSemanticFingerprints.includes(finding.semanticFingerprint));
}

/** Full context for detection, mutation, publishing, and autofix intent. */
export interface BugbotContext {
  existingByFindingId: ExistingByFindingId;
  /** Full issue-comment bodies reserved for read-modify-write operations. */
  issueComments: Array<{ id: number; body: string | null }>;
  openPrNumbers: number[];
  /** Bounded text sent to the configured findings agent. */
  previousFindingsBlock: string;
  /** Canonical, bounded PR diff supplied by the GitHub API. */
  reviewDiffBlock?: string;
  /** Bounded human review discussion that may affect finding validity. */
  reviewConversationBlock?: string;
  prContext: BugbotPrContext | null;
  /** Bounded bodies used by intent prompts and autofix. */
  unresolvedFindingsWithBody: UnresolvedFindingWithBody[];
  /** Ordered, bounded rule content supplied to the reviewer. */
  reviewRulesBlock?: string;
  /** Auditable rule identities in effective precedence order. */
  reviewRuleSources?: string[];
  omittedReviewRules?: number;
}
