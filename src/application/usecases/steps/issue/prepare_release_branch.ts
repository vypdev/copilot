import type { LinkedBranchCommandPort } from "../../../ports/branch_preparation_ports";
import { Execution } from "../../../../data/model/execution";
import { getResultPayload, Result } from "../../../../data/model/result";
import { buildCommitPrefix as buildCommitPrefixValue } from "../common/execute_script_use_case";
import { logDebugInfo, logWarn } from "../../../ports/logging_ports";

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

  const branchName = getResultPayload(lastAction.payload)?.newBranchName;
  const baseSha = getResultPayload(lastAction.payload)?.baseSha;
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
  if (typeof baseSha === "string" && baseSha.length > 0) {
    param.currentConfiguration.releaseOriginBranch = param.branches.development;
    param.currentConfiguration.releaseOriginSha = baseSha;
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
    `Add the **${param.labels.deploy}** label to run the \`${param.workflows.release}\` workflow. Copilot will create the immutable version tag only after the production promotion PR merges.`,
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

async function buildConfiguredCommitPrefix(
  param: Execution,
  branchName: string,
): Promise<string> {
  if (!param.commitPrefixBuilder) return "";
  param.commitPrefixBuilderParams = { branchName };
  return buildCommitPrefixValue(branchName, param.commitPrefixBuilder);
}

function buildReleaseReminder(
  param: Execution,
  releaseUrl: string,
  developmentUrl: string,
  mainUrl: string,
): string {
  const branch = param.release.branch;
  return `Copilot will promote [\`${branch}\`](${releaseUrl}) into [\`${param.branches.main}\`](${mainUrl}) before publication, then reconcile the accepted production commit into the current [\`${param.branches.development}\`](${developmentUrl}) branch. Do not create the version tag or either merge PR manually unless the issue control center requests recovery.`;
}
