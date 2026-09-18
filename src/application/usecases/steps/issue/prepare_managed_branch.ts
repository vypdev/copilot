import { Result } from "../../../../data/model/result";
import { decideManagedBranchPreparation } from "../../../policies/branch_preparation_policy";
import {
  buildManagedBranchPresentation,
  readManagedBranchCreationPayload,
} from "../../../policies/managed_branch_result_policy";
import type { BranchNamePort } from "../../../ports/branch_lifecycle_ports";
import type {
  BranchPropagationDelayPort,
  BoundLinkedBranchCommandPort,
} from "../../../ports/branch_preparation_ports";
import { logDebugInfo } from "../../../ports/logging_ports";
import { toApplicationError } from "../../../errors/application_error";
import { ParamUseCase } from "../../base/param_usecase";
import { buildCommitPrefix } from "../common/execute_script_use_case";
import {
  branchPreparationOutcome,
  type BranchPreparationContext,
  type BranchPreparationOutcome,
  type MoveIssueToInProgressContext,
} from '../../issue_workflow_context';

export interface ManagedBranchPreparationDependencies {
  branchNamePort: BranchNamePort;
  linkedBranchCommandPort: BoundLinkedBranchCommandPort;
  branchPropagationDelayPort: BranchPropagationDelayPort;
  moveIssueToInProgressUseCase: ParamUseCase<MoveIssueToInProgressContext, Result[]>;
}

export async function prepareManagedBranch(
  param: BranchPreparationContext,
  issueTitle: string,
  branches: readonly string[],
  taskId: string,
  dependencies: ManagedBranchPreparationDependencies,
): Promise<BranchPreparationOutcome> {
  logDebugInfo(`Branch type: ${param.managementBranch}`);
  const decision = decideManagedBranchPreparation({
    availableBranches: branches,
    issueNumber: param.issueNumber,
    formattedIssueTitle: dependencies.branchNamePort.formatBranchName(
      issueTitle,
      param.issueNumber,
    ),
    targetBranchType: param.managementBranch,
    developmentBranch: param.branches.development,
    managedBranchTypes: [
      ...param.branches.managedTypes,
    ],
    currentParentBranch: param.currentConfiguration.parentBranch,
  });

  if (decision.kind === "already-exists") {
    return branchPreparationOutcome([
      new Result({
        id: taskId,
        success: true,
        executed: false,
      }),
    ], { workingBranch: decision.targetBranchName });
  }

  const branchesResult = await dependencies.linkedBranchCommandPort.createLinkedBranch(
    decision.baseBranchName,
    decision.targetBranchName,
    param.issueNumber,
  );
  const lastAction = branchesResult.at(-1);
  if (!lastAction?.success || !lastAction.executed) return branchPreparationOutcome(branchesResult);

  const branchPayload = readManagedBranchCreationPayload(lastAction.payload);
  if (!branchPayload) return branchPreparationOutcome(branchesResult);

  const commitPrefix = await buildConfiguredCommitPrefix(
    param,
    branchPayload.newBranchName,
  );
  const presentation = buildManagedBranchPresentation({
    repositoryWebUrl: param.repositoryWebUrl,
    developmentBranch: param.branches.development,
    baseBranchName: branchPayload.baseBranchName,
    baseBranchUrl: branchPayload.baseBranchUrl,
    branchName: branchPayload.newBranchName,
    newBranchUrl: branchPayload.newBranchUrl,
    isRename: decision.isRename,
    commitPrefix,
  });
  const result: Result[] = [
    new Result({
      id: taskId,
      success: true,
      executed: true,
      steps: [presentation.step],
      reminders: presentation.reminders,
    }),
  ];
  const configurationPatch = {
    parentBranch: decision.parentBranch,
    workingBranch: branchPayload.newBranchName,
  } as const;
  try {
    await dependencies.branchPropagationDelayPort.waitForLinkedBranch();
    result.push(
      ...(await dependencies.moveIssueToInProgressUseCase.invoke(param.moveToInProgress)),
    );
  } catch (error) {
    const semanticError = toApplicationError(
      error,
      'provider.unavailable',
      'The branch was created, but its linked issue state could not be synchronized.',
      {
        recovery: {
          id: 'managed-branch-enrichment-failed',
          variables: { branchName: branchPayload.newBranchName },
        },
      },
    );
    result.push(new Result({
      id: taskId,
      success: false,
      executed: true,
      steps: ['The linked branch was retained, but issue state synchronization failed. Continue on that branch and rerun enrichment.'],
      errors: [semanticError],
    }));
  }
  return branchPreparationOutcome(result, configurationPatch);
}

async function buildConfiguredCommitPrefix(
  param: BranchPreparationContext,
  branchName: string,
): Promise<string> {
  if (!param.commitPrefixBuilder) return "";
  return buildCommitPrefix(branchName, param.commitPrefixBuilder);
}
