import type {
  CommitTagQueryPort,
  LinkedBranchCommandPort,
} from "../../../ports/branch_preparation_ports";
import { Execution } from "../../../../data/model/execution";
import { Result } from "../../../../data/model/result";
import { logDebugInfo, logWarn } from "../../../../utils/logger";

export async function prepareHotfixBranch(
  param: Execution,
  commitTagQuery: CommitTagQueryPort,
  linkedBranchCommand: LinkedBranchCommandPort,
  branches: string[],
  taskId: string,
): Promise<Result[]> {
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
    return [
      new Result({
        id: taskId,
        success: false,
        executed: true,
        steps: ["Tried to create a hotfix but no tag was found."],
      }),
    ];
  }

  const branchOid = await commitTagQuery.getCommitTag(hotfix.baseVersion);
  const tagUrl = `https://github.com/${param.owner}/${param.repo}/tree/${hotfix.baseBranch}`;
  const hotfixUrl = `https://github.com/${param.owner}/${param.repo}/tree/${hotfix.branch}`;
  param.currentConfiguration.parentBranch = hotfix.baseBranch;
  param.currentConfiguration.hotfixBranch = hotfix.branch;
  param.currentConfiguration.workingBranch = hotfix.branch;

  if (branches.includes(hotfix.branch)) {
    return [
      new Result({
        id: taskId,
        success: true,
        executed: true,
        steps: [
          `The branch [**${hotfix.branch}**](${hotfixUrl}) already exists and will not be created from the tag [**${hotfix.baseBranch}**](${tagUrl}).`,
        ],
      }),
    ];
  }

  const linkResult = await linkedBranchCommand.createLinkedBranch(
    param.owner,
    param.repo,
    hotfix.baseBranch,
    hotfix.branch,
    param.issueNumber,
    branchOid,
    param.tokens.token,
  );
  const lastAction = linkResult.at(-1);
  if (!lastAction?.success) return linkResult;

  logDebugInfo(
    `Hotfix branch successfully linked to issue: ${JSON.stringify(linkResult)}`,
  );
  return [
    new Result({
      id: taskId,
      success: true,
      executed: true,
      steps: [
        `The tag [**${hotfix.baseBranch}**](${tagUrl}) was used to create the branch [**${hotfix.branch}**](${hotfixUrl})`,
      ],
    }),
  ];
}
