import {
  BUGBOT_FINDING_STATES,
  countBugbotFindingStates,
  isBugbotActionableState,
  type BugbotFindingState,
  type BugbotFindingStateCounts,
} from './review_state';
import type { BugbotContextCoverage } from './context';

export type BugbotProjectionOutcome =
  | 'complete'
  | 'partial'
  | 'failed'
  | 'superseded'
  | 'dry-run';

export interface BugbotProjectedFinding {
  readonly id: string;
  readonly state: BugbotFindingState;
  readonly title?: string;
  readonly url?: string;
  readonly parentReviewIdentity?: string;
}

export interface BugbotReviewProjection {
  readonly schemaVersion: 1;
  readonly pullRequestNumber: number;
  readonly analyzedHeadSha: string;
  readonly verifiedHeadSha: string;
  readonly findings: readonly BugbotProjectedFinding[];
  readonly counts: Readonly<BugbotFindingStateCounts>;
  readonly actionableCount: number;
  readonly outcome: BugbotProjectionOutcome;
  readonly coverage: BugbotContextCoverage;
  readonly errors: readonly string[];
  readonly digest: string;
}

export function buildBugbotReviewProjection(input: {
  pullRequestNumber: number;
  analyzedHeadSha: string;
  verifiedHeadSha?: string;
  findings: readonly BugbotProjectedFinding[];
  errors?: readonly string[];
  coverage: BugbotContextCoverage;
  superseded?: boolean;
  dryRun?: boolean;
}): BugbotReviewProjection {
  const findings = [...input.findings].sort((left, right) =>
    left.id.localeCompare(right.id),
  );
  const counts = countBugbotFindingStates(
    findings.map((finding) => finding.state),
  );
  const errors = [...(input.errors ?? [])];
  const outcome: BugbotProjectionOutcome = input.superseded
    ? 'superseded'
    : input.dryRun
      ? 'dry-run'
      : input.coverage.status === 'partial'
        ? 'partial'
        : errors.length > 0 || counts.unknown > 0
        ? (findings.length > 0 ? 'partial' : 'failed')
        : 'complete';
  const canonical = JSON.stringify({
    schemaVersion: 1,
    pullRequestNumber: input.pullRequestNumber,
    analyzedHeadSha: input.analyzedHeadSha,
    verifiedHeadSha: input.verifiedHeadSha ?? input.analyzedHeadSha,
    findings: findings.map(({ id, state, parentReviewIdentity }) => ({
      id,
      state,
      parentReviewIdentity,
    })),
    counts: BUGBOT_FINDING_STATES.map((state) => [state, counts[state]]),
    outcome,
    coverage: input.coverage,
    errors,
  });
  return {
    schemaVersion: 1,
    pullRequestNumber: input.pullRequestNumber,
    analyzedHeadSha: input.analyzedHeadSha,
    verifiedHeadSha: input.verifiedHeadSha ?? input.analyzedHeadSha,
    findings,
    counts,
    actionableCount: findings.filter((finding) =>
      isBugbotActionableState(finding.state),
    ).length,
    outcome,
    coverage: input.coverage,
    errors,
    digest: stableDigest(canonical),
  };
}

function stableDigest(value: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}
