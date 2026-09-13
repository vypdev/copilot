import { Result } from "../../../../data/model/result";
import type { BoundIssuePushNotificationPort } from "../../../../application/ports/issue_lifecycle_ports";
import type { CommitNotificationContext } from '../../push_single_action_contexts';
import { logDebugInfo, logError } from "../../../ports/logging_ports";
import { buildCommitPrefix } from "../common/execute_script_use_case";
import { buildCommitNotificationContent } from "./commit_notification_content_policy";
import { toApplicationError } from "../../../errors/application_error";

export async function runNotifyNewCommitOnIssueWorkflow(
  param: CommitNotificationContext,
  taskId: string,
  issueRepository: BoundIssuePushNotificationPort,
): Promise<Result[]> {
  const result: Result[] = [];
  try {
    const branchName = param.branch;
    let commitPrefix = "";
    if (param.commitPrefixBuilder.length > 0) {
      commitPrefix = buildCommitPrefix(branchName, param.commitPrefixBuilder);
      logDebugInfo(`Commit prefix: ${commitPrefix}`);
    }

    const { body } = buildCommitNotificationContent(param, commitPrefix);
    if (param.reopenOnPush) {
      const opened = await issueRepository.openIssue(
        param.issueNumber,
      );
      if (opened) {
        await issueRepository.addComment(
          param.issueNumber,
          `This issue was re-opened after pushing new commits to the branch \`${branchName}\`.`,
        );
      }
    }

    await issueRepository.addComment(
      param.issueNumber,
      body,
    );
  } catch (error) {
    const semanticError = toApplicationError(error, 'provider.unavailable', 'Unable to notify the issue about the new commit.');
    logError(semanticError);
    result.push(
      new Result({
        id: taskId,
        success: false,
        executed: true,
        steps: ["Tried to notify the new commit on the issue, but there was a problem."],
        errors: [semanticError],
      }),
    );
  }
  return result;
}
