import type {
  CommitTagQueryPort,
  BoundLinkedBranchCommandPort,
} from "../../../ports/branch_preparation_ports";
import { Result } from "../../../../data/model/result";
import { logDebugInfo, logWarn } from "../../../ports/logging_ports";
import {
  branchPreparationOutcome,
  type BranchPreparationContext,
  type BranchPreparationOutcome,
} from '../../issue_workflow_context';

export async function prepareHotfixBranch(
  param: BranchPreparationContext,
  commitTagQuery: CommitTagQueryPort,
  linkedBranchCommand: BoundLinkedBranchCommandPort,
  branches: readonly string[],
  taskId: string,
): Promise<BranchPreparationOutcome> {
  const { hotfix } = param;
  if (
    hotfix.baseVersion === undefined ||
    hotfix.version === undefined ||
    hotfix.branch === undefined ||
    hotfix.baseBranch === undefined
  ) {
    logWarn(
      "PrepareBranches: hotfix requested but no tag or base version found.",
    );
    return branchPreparationOutcome([
      new Result({
        id: taskId,
        success: false,
        executed: true,
        steps: ["Tried to create a hotfix but no tag was found."],
      }),
    ]);
  }

  const branchOid = await commitTagQuery.getCommitTag(hotfix.baseVersion);
  const tagUrl = `${param.repositoryWebUrl}/tree/${encodeURIComponent(hotfix.baseBranch)}`;
  const hotfixUrl = `${param.repositoryWebUrl}/tree/${encodeURIComponent(hotfix.branch)}`;
  const basePatch = {
    parentBranch: hotfix.baseBranch,
    hotfixBranch: hotfix.branch,
    workingBranch: hotfix.branch,
  } as const;

  if (branches.includes(hotfix.branch)) {
    return branchPreparationOutcome([
      new Result({
        id: taskId,
        success: true,
        executed: true,
        steps: [
          `The branch [**${hotfix.branch}**](${hotfixUrl}) already exists and will not be created from the tag [**${hotfix.baseBranch}**](${tagUrl}).`,
        ],
      }),
    ], basePatch);
  }

  const linkResult = await linkedBranchCommand.createLinkedBranch(
    hotfix.baseBranch,
    hotfix.branch,
    param.issueNumber,
    branchOid,
  );
  const lastAction = linkResult.at(-1);
  if (!lastAction?.success || !lastAction.executed) return branchPreparationOutcome(linkResult);

  logDebugInfo(
    `Hotfix branch successfully linked to issue: ${JSON.stringify(linkResult)}`,
  );
  return branchPreparationOutcome([
    new Result({
      id: taskId,
      success: true,
      executed: true,
      steps: [
        `The tag [**${hotfix.baseBranch}**](${tagUrl}) was used to create the branch [**${hotfix.branch}**](${hotfixUrl})`,
      ],
    }),
  ], {
    ...basePatch,
    ...(branchOid ? { hotfixOriginSha: branchOid } : {}),
  });
}
