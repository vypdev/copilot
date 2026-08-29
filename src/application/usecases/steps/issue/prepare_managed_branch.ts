import { Execution } from "../../../../data/model/execution";
import { Result } from "../../../../data/model/result";
import { decideManagedBranchPreparation } from "../../../policies/branch_preparation_policy";
import {
  buildManagedBranchPresentation,
  readManagedBranchCreationPayload,
} from "../../../policies/managed_branch_result_policy";
import type { BranchNamePort } from "../../../ports/branch_lifecycle_ports";
import type {
  BranchPropagationDelayPort,
  LinkedBranchCommandPort,
} from "../../../ports/branch_preparation_ports";
import { logDebugInfo } from "../../../ports/logging_ports";
import { ParamUseCase } from "../../base/param_usecase";
import { buildCommitPrefix } from "../common/execute_script_use_case";

export interface ManagedBranchPreparationDependencies {
  branchNamePort: BranchNamePort;
  linkedBranchCommandPort: LinkedBranchCommandPort;
  branchPropagationDelayPort: BranchPropagationDelayPort;
  moveIssueToInProgressUseCase: ParamUseCase<Execution, Result[]>;
}

export async function prepareManagedBranch(
  param: Execution,
  issueTitle: string,
  branches: readonly string[],
  taskId: string,
  dependencies: ManagedBranchPreparationDependencies,
): Promise<Result[]> {
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
      param.branches.featureTree,
      param.branches.bugfixTree,
      param.branches.docsTree,
      param.branches.choreTree,
    ].filter(
      (branchType): branchType is string =>
        typeof branchType === "string" && branchType.length > 0,
    ),
    currentParentBranch: param.currentConfiguration.parentBranch,
  });

  if (decision.kind === "already-exists") {
    return [
      new Result({
        id: taskId,
        success: true,
        executed: false,
      }),
    ];
  }

  param.currentConfiguration.parentBranch = decision.parentBranch;
  const branchesResult = await dependencies.linkedBranchCommandPort.createLinkedBranch(
    param.owner,
    param.repo,
    decision.baseBranchName,
    decision.targetBranchName,
    param.issueNumber,
    undefined,
    param.tokens.token,
  );
  const lastAction = branchesResult.at(-1);
  if (!lastAction?.success || !lastAction.executed) return branchesResult;

  const branchPayload = readManagedBranchCreationPayload(lastAction.payload);
  if (!branchPayload) return branchesResult;
  param.currentConfiguration.workingBranch = branchPayload.newBranchName;

  const commitPrefix = await buildConfiguredCommitPrefix(
    param,
    branchPayload.newBranchName,
  );
  const presentation = buildManagedBranchPresentation({
    owner: param.owner,
    repo: param.repo,
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
  await dependencies.branchPropagationDelayPort.waitForLinkedBranch();
  result.push(
    ...(await dependencies.moveIssueToInProgressUseCase.invoke(param)),
  );
  return result;
}

async function buildConfiguredCommitPrefix(
  param: Execution,
  branchName: string,
): Promise<string> {
  if (!param.commitPrefixBuilder) return "";
  param.commitPrefixBuilderParams = { branchName };
  return buildCommitPrefix(branchName, param.commitPrefixBuilder);
}
