import { isAgentConfigurationReady } from "../../../data/model/agent";
import type { Execution } from "../../../data/model/execution";
import { Result } from "../../../data/model/result";
import type { BranchMergePreparation } from "../../ports/branch_sync_ports";
import { isSensitiveWorkspacePath } from "../steps/commit/bugbot/workspace_changes";

export const BRANCH_SYNC_TASK_ID = "SyncBranchUseCase";
const MAX_AGENT_CONFLICT_PATHS = 20;

export type BranchSyncOutcome =
  | "already-aligned"
  | "dry-run-clean"
  | "dry-run-conflicted"
  | "merged-cleanly"
  | "merged-with-agent";

export function branchSyncConflictEligibilityError(
  preparation: Extract<BranchMergePreparation, { kind: "conflicted" }>,
  useAgent: boolean,
  execution: Execution,
): string | undefined {
  if (!useAgent) return "The merge has conflicts and agent resolution was disabled with --no-agent.";
  if (!isAgentConfigurationReady(execution.ai.getAgentConfiguration("fixer"))) {
    return "The merge has conflicts, but no fixer agent is configured.";
  }
  if (preparation.conflictPaths.length > MAX_AGENT_CONFLICT_PATHS) {
    return `The merge has ${preparation.conflictPaths.length} conflicted files; the automated limit is ${MAX_AGENT_CONFLICT_PATHS}.`;
  }
  const sensitive = preparation.conflictPaths.filter(isSensitiveWorkspacePath);
  return sensitive.length > 0
    ? `Automated conflict resolution is not allowed for sensitive paths: ${sensitive.join(", ")}.`
    : undefined;
}

export function completedBranchSyncResult(input: {
  readonly preparation: BranchMergePreparation;
  readonly parentBranch: string;
  readonly workingBranch: string;
  readonly outcome: BranchSyncOutcome;
  readonly verificationCount: number;
  readonly commitSha?: string;
}): Result {
  const { preparation, parentBranch, workingBranch, outcome } = input;
  const text: Record<BranchSyncOutcome, string> = {
    "already-aligned": `No update was needed: \`${workingBranch}\` already contains \`${parentBranch}\`.`,
    "dry-run-clean": `Dry run complete: \`${parentBranch}\` can be merged into \`${workingBranch}\` without conflicts. Nothing was pushed.`,
    "dry-run-conflicted": `Dry run complete: the merge has ${preparation.kind === "conflicted" ? preparation.conflictPaths.length : 0} conflict(s). Nothing was pushed and no agent was invoked.`,
    "merged-cleanly": `Merged \`${parentBranch}\` into \`${workingBranch}\` cleanly and pushed the result.`,
    "merged-with-agent": `Merged \`${parentBranch}\` into \`${workingBranch}\`, used the fixer agent to resolve conflicts, verified the workspace, and pushed the result.`,
  };
  return new Result({
    id: BRANCH_SYNC_TASK_ID,
    success: true,
    executed: outcome !== "already-aligned",
    stepFormat: "markdown",
    steps: [text[outcome]],
    payload: {
      outcome,
      parentBranch,
      workingBranch,
      parentSha: preparation.parentSha,
      childSha: preparation.childSha,
      conflictPaths: preparation.kind === "conflicted" ? preparation.conflictPaths : [],
      verificationCount: input.verificationCount,
      commitSha: input.commitSha,
    },
  });
}

export function unavailableBranchSyncResult(reason: string): Result {
  return new Result({ id: BRANCH_SYNC_TASK_ID, success: false, executed: false, errors: [reason] });
}

export function failedBranchSyncResult(reason: string, cause?: unknown): Result {
  return new Result({
    id: BRANCH_SYNC_TASK_ID,
    success: false,
    executed: true,
    steps: [reason],
    errors: [cause === undefined ? reason : errorWithCause(reason, cause)],
  });
}

function errorWithCause(message: string, cause: unknown): Error {
  const error = new Error(message);
  (error as Error & { cause?: unknown }).cause = cause;
  return error;
}
