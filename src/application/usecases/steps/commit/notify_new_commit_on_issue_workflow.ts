import type { Execution } from "../../../../data/model/execution";
import { Result } from "../../../../data/model/result";
import type { IssueNotificationPort } from "../../../../application/ports/issue_lifecycle_ports";
import { logDebugInfo, logError } from "../../../ports/logging_ports";
import { buildCommitPrefix } from "../common/execute_script_use_case";
import { buildCommitNotificationContent } from "./commit_notification_content_policy";

export async function runNotifyNewCommitOnIssueWorkflow(
  param: Execution,
  taskId: string,
  issueRepository: IssueNotificationPort,
): Promise<Result[]> {
  const result: Result[] = [];
  try {
    const branchName = param.commit.branch;
    let commitPrefix = "";
    if (param.commitPrefixBuilder.length > 0) {
      param.commitPrefixBuilderParams = { branchName };
      commitPrefix = buildCommitPrefix(branchName, param.commitPrefixBuilder);
      logDebugInfo(`Commit prefix: ${commitPrefix}`);
    }

    const { body } = buildCommitNotificationContent(param, commitPrefix);
    if (param.issue.reopenOnPush) {
      const opened = await issueRepository.openIssue(
        param.owner,
        param.repo,
        param.issueNumber,
        param.tokens.token,
      );
      if (opened) {
        await issueRepository.addComment(
          param.owner,
          param.repo,
          param.issueNumber,
          `This issue was re-opened after pushing new commits to the branch \`${branchName}\`.`,
          param.tokens.token,
        );
      }
    }

    await issueRepository.addComment(
      param.owner,
      param.repo,
      param.issueNumber,
      body,
      param.tokens.token,
    );
  } catch (error) {
    logError(
      `NotifyNewCommitOnIssue: failed to notify issue #${param.issueNumber}.`,
      error instanceof Error ? { stack: error.stack } : undefined,
    );
    result.push(
      new Result({
        id: taskId,
        success: false,
        executed: true,
        steps: ["Tried to notify the new commit on the issue, but there was a problem."],
        errors: [error?.toString() ?? "Unknown error"],
      }),
    );
  }
  return result;
}
