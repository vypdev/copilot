import { finalizeWorkspaceMutation } from '../workspace_mutation_guard';
import { toApplicationError } from '../../../../errors/application_error';
import type { BugbotGitMutationPort } from "../../../../../application/ports/bugbot_git_ports";
import { logInfo } from "../../../../ports/logging_ports";
import { checkoutBranch } from '../git_branch_checkout';
import { MAX_VERIFY_COMMANDS, limitVerifyCommands } from "./verify_command_policy";
import { runVerifyCommands } from "./verify_command_runner";
import { hasWorkspaceChanges, listWorkspacePaths } from "./workspace_changes";
import type { BugbotCommitContext } from './bugbot_review_operation_context';

export interface CommitAndPushPreflightOptions {
  branch: string;
  branchOverride?: boolean;
  workspacePaths?: string[];
}

export type CommitAndPushPreflightResult =
  | { status: "ready"; workspacePaths?: string[] }
  | { status: "success" }
  | { status: "failure"; error: string };

export async function runCommitAndPushPreflight(
  context: BugbotCommitContext,
  options: CommitAndPushPreflightOptions,
  gitCommitPort: BugbotGitMutationPort,
): Promise<CommitAndPushPreflightResult> {
  if (!options.branch?.trim()) {
    return { status: "failure", error: "No branch to commit to." };
  }
  if (options.branchOverride && !(await checkoutBranch(options.branch, gitCommitPort))) {
    return { status: "failure", error: `Failed to checkout branch ${options.branch}.` };
  }

  let excludedBeforeVerification: string[] = [];
  if (options.workspacePaths) {
    try {
      excludedBeforeVerification = (await listWorkspacePaths(gitCommitPort)).filter(path => !options.workspacePaths!.includes(path));
    } catch (error) {
      return { status: "failure", error: toApplicationError(error, 'provider.unavailable', 'Pre-verification workspace could not be verified.').message };
    }
  }
  const verification = await runVerification(context, gitCommitPort);
  if (verification) return { status: "failure", error: verification };
  if (!(await hasWorkspaceChanges(gitCommitPort))) {
    return { status: "success" };
  }
  if (options.workspacePaths && options.workspacePaths.length === 0) {
    return { status: "failure", error: "No safe workspace paths to commit." };
  }
  if (options.workspacePaths) {
    try {
      const final = await finalizeWorkspaceMutation(gitCommitPort, excludedBeforeVerification, 'Automated commit verification');
      return { status: "ready", workspacePaths: final.workspacePaths };
    } catch (error) {
      return { status: "failure", error: toApplicationError(error, 'workflow.failed', 'Post-verification workspace could not be verified.').message };
    }
  }
  return { status: "ready" };
}

async function runVerification(
  context: BugbotCommitContext,
  gitCommitPort: BugbotGitMutationPort,
): Promise<string | undefined> {
  const configured = [...context.verifyCommands];
  const verifyCommands = limitVerifyCommands(Array.isArray(configured) ? configured : []);
  if (Array.isArray(configured) && configured.length > MAX_VERIFY_COMMANDS) {
    logInfo(`Limiting verify commands to ${MAX_VERIFY_COMMANDS} (configured: ${configured.length}).`);
  }
  if (verifyCommands.length === 0) return undefined;

  logInfo(`Running ${verifyCommands.length} verify ${verifyCommands.length === 1 ? 'command' : 'commands'}...`);
  const verify = await runVerifyCommands(
    verifyCommands,
    (program, args) => gitCommitPort.execute(program, args, { untrusted: true, verifyRuntimePrerequisites: true }),
  );
  return verify.success
    ? undefined
    : verify.error ?? `Verify command failed: ${verify.failedCommand ?? "unknown"}.`;
}
