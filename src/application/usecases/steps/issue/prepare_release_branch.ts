import type { LinkedBranchCommandPort } from "../../../ports/branch_preparation_ports";
import { Execution } from "../../../../data/model/execution";
import { Result } from "../../../../data/model/result";
import { CommitPrefixBuilderUseCase } from "../common/execute_script_use_case";
import { logDebugInfo, logWarn } from "../../../../utils/logger";

export async function prepareReleaseBranch(
  param: Execution,
  linkedBranchCommand: LinkedBranchCommandPort,
  branches: string[],
  taskId: string,
): Promise<Result[]> {
  const { release } = param;
  if (release.version === undefined || release.branch === undefined) {
    logWarn("PrepareBranches: release requested but no release version found.");
    return [
      new Result({
        id: taskId,
        success: false,
        executed: true,
        steps: ["Tried to create a release but no release version was found."],
      }),
    ];
  }

  param.currentConfiguration.releaseBranch = release.branch;
  param.currentConfiguration.workingBranch = release.branch;
  param.currentConfiguration.parentBranch = param.branches.development;

  const developmentUrl = `https://github.com/${param.owner}/${param.repo}/tree/${param.branches.development}`;
  const releaseUrl = `https://github.com/${param.owner}/${param.repo}/tree/${release.branch}`;
  const mainUrl = `https://github.com/${param.owner}/${param.repo}/tree/${param.branches.defaultBranch}`;

  if (branches.includes(release.branch)) {
    return [
      new Result({
        id: taskId,
        success: true,
        executed: true,
        reminders: [
          buildReleaseReminder(param, releaseUrl, developmentUrl, mainUrl),
        ],
      }),
    ];
  }

  const linkResult = await linkedBranchCommand.createLinkedBranch(
    param.owner,
    param.repo,
    param.branches.development,
    release.branch,
    param.issueNumber,
    undefined,
    param.tokens.token,
  );
  const lastAction = linkResult.at(-1);
  if (!lastAction?.success) return linkResult;

  const branchName = lastAction.payload?.newBranchName;
  if (typeof branchName !== "string" || branchName.length === 0) {
    return [
      new Result({
        id: taskId,
        success: false,
        executed: true,
        steps: ["Release branch creation returned no branch name."],
      }),
    ];
  }

  const fence = "```";
  const inlineCode = "`";
  const reminders = [
    `Before deploying, apply any change needed in [**${release.branch}**](${releaseUrl}):\n> ${fence}bash\n> git fetch -v && git checkout ${release.branch}\n> ${fence}\n>\n> Version files, changelogs..`,
  ];
  const commitPrefix = await buildCommitPrefix(param, branchName);
  if (commitPrefix)
    reminders.push(
      `Commit the needed changes with this prefix:\n> ${fence}\n>${commitPrefix}\n> ${fence}`,
    );
  reminders.push(
    `Create the tag version in [**${release.branch}**](${releaseUrl}).\n> Avoid using ${inlineCode}git merge --squash${inlineCode}, otherwise the created tag will be lost.`,
  );
  reminders.push(
    `Add the **${param.labels.deploy}** label to run the ${inlineCode}${param.workflows.release}${inlineCode} workflow.`,
  );
  reminders.push(
    buildReleaseReminder(param, releaseUrl, developmentUrl, mainUrl),
  );

  logDebugInfo(
    `Release branch successfully linked to issue: ${JSON.stringify(linkResult)}`,
  );
  return [
    new Result({
      id: taskId,
      success: true,
      executed: true,
      steps: [
        `The branch [**${param.branches.development}**](${developmentUrl}) was used to create the branch [**${release.branch}**](${releaseUrl})`,
      ],
      reminders,
    }),
  ];
}

async function buildCommitPrefix(
  param: Execution,
  branchName: string,
): Promise<string> {
  if (!param.commitPrefixBuilder) return "";
  param.commitPrefixBuilderParams = { branchName };
  const results = await new CommitPrefixBuilderUseCase().invoke(param);
  return results.at(-1)?.payload?.scriptResult?.toString() ?? "";
}

function buildReleaseReminder(
  param: Execution,
  releaseUrl: string,
  developmentUrl: string,
  mainUrl: string,
): string {
  const branch = param.release.branch;
  const inlineCode = "`";
  return `After deploying, the new changes on [${inlineCode}${branch}${inlineCode}](${releaseUrl}) must end on [${inlineCode}${param.branches.development}${inlineCode}](${developmentUrl}) and [${inlineCode}${param.branches.main}${inlineCode}](${mainUrl}).\n> **Quick actions:**\n> [New PR](https://github.com/${param.owner}/${param.repo}/compare/${param.branches.development}...${branch}?expand=1) from [${inlineCode}${branch}${inlineCode}](${releaseUrl}) to [${inlineCode}${param.branches.development}${inlineCode}](${developmentUrl}).\n> [New PR](https://github.com/${param.owner}/${param.repo}/compare/${param.branches.main}...${branch}?expand=1) from [${inlineCode}${branch}${inlineCode}](${releaseUrl}) to [${inlineCode}${param.branches.main}${inlineCode}](${mainUrl}).`;
}
