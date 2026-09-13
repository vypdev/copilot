import type { BoundLinkedBranchCommandPort } from "../../../ports/branch_preparation_ports";
import { getResultPayload, Result } from "../../../../data/model/result";
import { buildCommitPrefix as buildCommitPrefixValue } from "../common/execute_script_use_case";
import { logDebugInfo, logWarn } from "../../../ports/logging_ports";
import {
  branchPreparationOutcome,
  type BranchPreparationContext,
  type BranchPreparationOutcome,
} from '../../issue_workflow_context';

export async function prepareReleaseBranch(
  param: BranchPreparationContext,
  linkedBranchCommand: BoundLinkedBranchCommandPort,
  branches: readonly string[],
  taskId: string,
): Promise<BranchPreparationOutcome> {
  const { release } = param;
  if (release.version === undefined || release.branch === undefined) {
    logWarn("PrepareBranches: release requested but no release version found.");
    return branchPreparationOutcome([
      new Result({
        id: taskId,
        success: false,
        executed: true,
        steps: ["Tried to create a release but no release version was found."],
      }),
    ]);
  }

  const developmentUrl = `${param.repositoryWebUrl}/tree/${encodeURIComponent(param.branches.development)}`;
  const releaseUrl = `${param.repositoryWebUrl}/tree/${encodeURIComponent(release.branch)}`;
  const mainUrl = `${param.repositoryWebUrl}/tree/${encodeURIComponent(param.branches.defaultBranch)}`;
  const basePatch = {
    releaseBranch: release.branch,
    workingBranch: release.branch,
    parentBranch: param.branches.development,
  } as const;

  if (branches.includes(release.branch)) {
    return branchPreparationOutcome([
      new Result({
        id: taskId,
        success: true,
        executed: true,
        reminders: [
          buildReleaseReminder(param, releaseUrl, developmentUrl, mainUrl),
        ],
      }),
    ], basePatch);
  }

  const linkResult = await linkedBranchCommand.createLinkedBranch(
    param.branches.development,
    release.branch,
    param.issueNumber,
  );
  const lastAction = linkResult.at(-1);
  if (!lastAction?.success || !lastAction.executed) return branchPreparationOutcome(linkResult);

  const branchName = getResultPayload(lastAction.payload)?.newBranchName;
  const baseSha = getResultPayload(lastAction.payload)?.baseSha;
  if (typeof branchName !== "string" || branchName.length === 0) {
    return branchPreparationOutcome([
      new Result({
        id: taskId,
        success: false,
        executed: true,
        steps: ["Release branch creation returned no branch name."],
      }),
    ]);
  }

  const fence = "```";
  const reminders = [
    `Before deploying, apply any change needed in [**${release.branch}**](${releaseUrl}):\n> ${fence}bash\n> git fetch -v && git checkout ${release.branch}\n> ${fence}\n>\n> Version files, changelogs..`,
  ];
  const commitPrefix = await buildConfiguredCommitPrefix(param, branchName);
  if (commitPrefix)
    reminders.push(
      `Commit the needed changes with this prefix:\n> ${fence}\n>${commitPrefix}\n> ${fence}`,
    );
  reminders.push(
    `Add the **${param.deployLabel}** label to run the \`${param.releaseWorkflow}\` workflow. Copilot will create the immutable version tag only after the production promotion PR merges.`,
  );
  reminders.push(
    buildReleaseReminder(param, releaseUrl, developmentUrl, mainUrl),
  );

  logDebugInfo(
    `Release branch successfully linked to issue: ${JSON.stringify(linkResult)}`,
  );
  return branchPreparationOutcome([
    new Result({
      id: taskId,
      success: true,
      executed: true,
      steps: [
        `The branch [**${param.branches.development}**](${developmentUrl}) was used to create the branch [**${release.branch}**](${releaseUrl})`,
      ],
      reminders,
    }),
  ], {
    ...basePatch,
    ...(typeof baseSha === 'string' && baseSha.length > 0
      ? { releaseOriginBranch: param.branches.development, releaseOriginSha: baseSha }
      : {}),
  });
}

async function buildConfiguredCommitPrefix(
  param: BranchPreparationContext,
  branchName: string,
): Promise<string> {
  if (!param.commitPrefixBuilder) return "";
  return buildCommitPrefixValue(branchName, param.commitPrefixBuilder);
}

function buildReleaseReminder(
  param: BranchPreparationContext,
  releaseUrl: string,
  developmentUrl: string,
  mainUrl: string,
): string {
  const branch = param.release.branch;
  return `Copilot will promote [\`${branch}\`](${releaseUrl}) into [\`${param.branches.main}\`](${mainUrl}) before publication, then reconcile the accepted production commit into the current [\`${param.branches.development}\`](${developmentUrl}) branch. Do not create the version tag or either merge PR manually unless the issue control center requests recovery.`;
}
