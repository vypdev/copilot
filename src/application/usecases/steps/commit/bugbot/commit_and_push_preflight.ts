import type { GitCommitPort } from "../../../../../application/ports/git_ports";
import type { Execution } from "../../../../../data/model/execution";
import { logInfo } from "../../../../ports/logging_ports";
import { checkoutBranch } from "./git_branch_checkout";
import { MAX_VERIFY_COMMANDS, limitVerifyCommands } from "./verify_command_policy";
import { runVerifyCommands } from "./verify_command_runner";
import { hasWorkspaceChanges } from "./workspace_changes";

export interface CommitAndPushPreflightOptions {
  branch: string;
  branchOverride?: boolean;
  workspacePaths?: string[];
}

export type CommitAndPushPreflightResult =
  | { status: "ready" }
  | { status: "success" }
  | { status: "failure"; error: string };

export async function runCommitAndPushPreflight(
  execution: Execution,
  options: CommitAndPushPreflightOptions,
  gitCommitPort: GitCommitPort,
): Promise<CommitAndPushPreflightResult> {
  if (!options.branch?.trim()) {
    return { status: "failure", error: "No branch to commit to." };
  }
  if (options.branchOverride && !(await checkoutBranch(options.branch, gitCommitPort))) {
    return { status: "failure", error: `Failed to checkout branch ${options.branch}.` };
  }

  const verification = await runVerification(execution, gitCommitPort);
  if (verification) return { status: "failure", error: verification };
  if (!(await hasWorkspaceChanges(gitCommitPort))) {
    return { status: "success" };
  }
  if (options.workspacePaths && options.workspacePaths.length === 0) {
    return { status: "failure", error: "No safe workspace paths to commit." };
  }
  return { status: "ready" };
}

async function runVerification(
  execution: Execution,
  gitCommitPort: GitCommitPort,
): Promise<string | undefined> {
  const configured = execution.ai?.getBugbotFixVerifyCommands?.() ?? [];
  const verifyCommands = limitVerifyCommands(Array.isArray(configured) ? configured : []);
  if (Array.isArray(configured) && configured.length > MAX_VERIFY_COMMANDS) {
    logInfo(`Limiting verify commands to ${MAX_VERIFY_COMMANDS} (configured: ${configured.length}).`);
  }
  if (verifyCommands.length === 0) return undefined;

  logInfo(`Running ${verifyCommands.length} verify command(s)...`);
  const verify = await runVerifyCommands(
    verifyCommands,
    (program, args) => gitCommitPort.execute(program, args),
  );
  return verify.success
    ? undefined
    : verify.error ?? `Verify command failed: ${verify.failedCommand ?? "unknown"}.`;
}
