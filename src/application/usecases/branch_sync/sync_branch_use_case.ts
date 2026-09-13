import { Result } from "../../../data/model/result";
import type { BranchSyncCommandOptions } from "../../../domain/branch_sync_command";
import { getBranchSyncConflictsPrompt } from "../../../prompts/branch_sync_conflicts";
import type { FixerQueryPort } from "../../ports/agent_fixer_ports";
import type { BoundAuthenticatedUserPort } from "../../ports/authenticated_user_ports";
import type {
  BoundBranchDependencyQueryPort,
  BranchMergePreparation,
  BranchSyncTarget,
  BoundBranchSyncWorkspacePort,
} from "../../ports/branch_sync_ports";
import type { BugbotGitMutationPort } from '../../ports/bugbot_git_ports';
import type { BranchSyncContext } from '../push_single_action_contexts';
import { logError, logInfo } from "../../ports/logging_ports";
import { MAX_VERIFY_COMMANDS, limitVerifyCommands } from "../steps/commit/bugbot/verify_command_policy";
import { runVerifyCommands } from "../steps/commit/bugbot/verify_command_runner";
import type { ParamUseCase } from "../base/param_usecase";
import {
  BRANCH_SYNC_TASK_ID,
  branchSyncConflictEligibilityError,
  completedBranchSyncResult,
  failedBranchSyncResult,
  unavailableBranchSyncResult,
} from "./branch_sync_execution_policy";

export interface SyncBranchRequest {
  readonly context: BranchSyncContext;
  readonly options: BranchSyncCommandOptions;
}

/** Performs a race-safe parent-to-child merge and invokes the fixer only for eligible conflicts. */
export class SyncBranchUseCase implements ParamUseCase<SyncBranchRequest, Result[]> {
  readonly taskId = BRANCH_SYNC_TASK_ID;

  constructor(
    private readonly dependencies: BoundBranchDependencyQueryPort,
    private readonly workspace: BoundBranchSyncWorkspacePort,
    private readonly fixer: FixerQueryPort,
    private readonly authenticatedUser: BoundAuthenticatedUserPort,
    private readonly git: Pick<BugbotGitMutationPort, 'execute'>,
  ) {}

  async invoke(request: SyncBranchRequest): Promise<Result[]> {
    const { context, options } = request;
    try {
      const target = await this.dependencies.resolveTarget(context.conversationNumber);
      if (!target) return [unavailableBranchSyncResult("No linked working branch with an identifiable parent was found for this issue or pull request.")];

      const parentBranch = options.parentOverride ?? target.parentBranch;
      if (parentBranch === target.workingBranch) {
        return [unavailableBranchSyncResult("The parent and working branch must be different.")];
      }
      return await this.synchronize(context, options, target, parentBranch);
    } catch (cause) {
      await this.safeAbort();
      logError("Branch synchronization failed.");
      return [failedBranchSyncResult("Branch synchronization failed safely; no push was completed.", cause)];
    }
  }

  private async synchronize(
    context: BranchSyncContext,
    options: BranchSyncCommandOptions,
    target: BranchSyncTarget,
    parentBranch: string,
  ): Promise<Result[]> {
    const preparation = await this.workspace.prepare(parentBranch, target.workingBranch);
    if (preparation.kind === "aligned") {
      return [this.completed(preparation, parentBranch, target, "already-aligned", 0)];
    }
    if (options.dryRun) {
      await this.workspace.abort();
      const outcome = preparation.kind === "clean" ? "dry-run-clean" : "dry-run-conflicted";
      return [this.completed(preparation, parentBranch, target, outcome, 0)];
    }

    const conflictResolution = await this.resolveConflicts(context, preparation, parentBranch, target, options.useAgent);
    if (conflictResolution.failure) return [await this.abortFailure(conflictResolution.failure)];

    const verification = await this.verifyPreparedMerge(context, preparation);
    if (verification.failure) return [await this.abortFailure(verification.failure)];

    const author = await this.authenticatedUser.getUserDetails();
    const remoteValidation = await this.workspace.assertRemoteHeadsUnchanged(
      parentBranch,
      preparation.parentSha,
      target.workingBranch,
      preparation.childSha,
    );
    if (!remoteValidation.valid) {
      return [await this.abortFailure(remoteValidation.reason ?? "A branch changed while synchronization was running; retry from the latest heads.")];
    }

    const commitSha = await this.workspace.commitAndPush(
      target.workingBranch,
      `Merge ${parentBranch} into ${target.workingBranch}`,
      author,
    );
    const outcome = conflictResolution.agentUsed ? "merged-with-agent" : "merged-cleanly";
    return [this.completed(preparation, parentBranch, target, outcome, verification.commandCount, commitSha)];
  }

  private async resolveConflicts(
    context: BranchSyncContext,
    preparation: BranchMergePreparation,
    parentBranch: string,
    target: BranchSyncTarget,
    useAgent: boolean,
  ): Promise<{ readonly agentUsed: boolean; readonly failure?: string }> {
    if (preparation.kind !== "conflicted") return { agentUsed: false };
    const failure = branchSyncConflictEligibilityError(preparation, useAgent, context.agentConfiguration);
    if (failure) return { agentUsed: false, failure };

    logInfo(`Invoking the fixer agent for ${preparation.conflictPaths.length} merge conflict(s).`);
    const response = await this.fixer.fix({
      configuration: context.agentConfiguration,
      prompt: getBranchSyncConflictsPrompt({
        owner: context.repository.owner,
        repo: context.repository.name,
        parentBranch,
        workingBranch: target.workingBranch,
        conflictPaths: preparation.conflictPaths.map((path) => `- ${path}`).join("\n"),
      }),
    });
    if (!response?.text?.trim()) {
      return { agentUsed: false, failure: "The conflict-resolution agent returned no usable response." };
    }
    const validation = await this.workspace.validatePreparedMerge(preparation.conflictPaths);
    return validation.valid
      ? { agentUsed: true }
      : { agentUsed: false, failure: validation.reason ?? "The agent resolution did not pass workspace safety validation." };
  }

  private async verifyPreparedMerge(
    context: BranchSyncContext,
    preparation: BranchMergePreparation,
  ): Promise<{ readonly commandCount: number; readonly failure?: string }> {
    const commands = limitVerifyCommands([...context.verifyCommands]);
    if (commands.length === MAX_VERIFY_COMMANDS) logInfo(`Branch sync verification is capped at ${MAX_VERIFY_COMMANDS} commands.`);
    const verification = await runVerifyCommands(
      commands,
      (program, args) => this.git.execute(program, args, { untrusted: true }),
    );
    if (!verification.success) {
      return {
        commandCount: commands.length,
        failure: verification.error ?? `Verification failed: ${verification.failedCommand ?? "unknown command"}.`,
      };
    }
    const conflictPaths = preparation.kind === "conflicted" ? preparation.conflictPaths : [];
    const validation = await this.workspace.validatePreparedMerge(conflictPaths);
    return validation.valid
      ? { commandCount: commands.length }
      : { commandCount: commands.length, failure: validation.reason ?? "Verification commands changed the prepared merge unexpectedly." };
  }

  private completed(
    preparation: BranchMergePreparation,
    parentBranch: string,
    target: BranchSyncTarget,
    outcome: Parameters<typeof completedBranchSyncResult>[0]["outcome"],
    verificationCount: number,
    commitSha?: string,
  ): Result {
    return completedBranchSyncResult({
      preparation,
      parentBranch,
      workingBranch: target.workingBranch,
      outcome,
      verificationCount,
      commitSha,
    });
  }

  private async abortFailure(reason: string): Promise<Result> {
    await this.safeAbort();
    return failedBranchSyncResult(reason);
  }

  private async safeAbort(): Promise<void> {
    try {
      await this.workspace.abort();
    } catch {
      logError("Unable to abort the in-progress branch merge cleanly.");
    }
  }
}
