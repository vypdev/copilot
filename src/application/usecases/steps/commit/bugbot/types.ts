/**
 * Bugbot types: data structures used across detection, publishing, and autofix.
 * The configured agent computes the diff and returns findings; we never pass a pre-computed diff to it.
 */

/** Single finding from the configured findings agent. */
export interface BugbotFinding {
  id: string;
  title: string;
  description: string;
  /** Computed locally; never accepted from the agent as an authority. */
  fingerprint?: string;
  file?: string;
  line?: number;
  severity?: string;
  suggestion?: string;
}

export interface ExistingIssueFindingInfo {
  commentId: number;
  resolved: boolean;
  fingerprint?: string;
}

export interface ExistingPullRequestFindingInfo {
  commentIdentity: string;
  pullRequestNumber: number;
  resolved: boolean;
  fingerprint?: string;
}

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
  finding: Pick<BugbotFinding, 'id' | 'fingerprint'>,
): ExistingFindingInfo | undefined {
  const direct = existingByFindingId[finding.id];
  if (direct) return direct;
  if (!finding.fingerprint) return undefined;
  return Object.values(existingByFindingId).find((candidate) =>
    candidate.issue?.fingerprint === finding.fingerprint
    || candidate.pullRequest?.fingerprint === finding.fingerprint,
  );
}

/** Full context for detection, mutation, publishing, and autofix intent. */
export interface BugbotContext {
  existingByFindingId: ExistingByFindingId;
  /** Full issue-comment bodies reserved for read-modify-write operations. */
  issueComments: Array<{ id: number; body: string | null }>;
  openPrNumbers: number[];
  /** Bounded text sent to the configured findings agent. */
  previousFindingsBlock: string;
  prContext: BugbotPrContext | null;
  /** Bounded bodies used by intent prompts and autofix. */
  unresolvedFindingsWithBody: UnresolvedFindingWithBody[];
}
