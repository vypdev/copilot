import { Result } from "../../../../data/model/result";
import type { BoundIssueReopenPort } from "../../../../application/ports/issue_lifecycle_ports";
import type { CommitNotificationContext } from '../../push_single_action_contexts';
import { logError, logInfo } from "../../../ports/logging_ports";
import { toApplicationError } from "../../../errors/application_error";

export async function runNotifyNewCommitOnIssueWorkflow(
  param: CommitNotificationContext,
  taskId: string,
  issueRepository: BoundIssueReopenPort,
): Promise<Result[]> {
  const result: Result[] = [];
  try {
    if (param.reopenOnPush) {
      const opened = await issueRepository.openIssue(
        param.issueNumber,
      );
      logInfo(opened
        ? `Issue #${param.issueNumber} reopened after a push; native state is sufficient.`
        : `Issue #${param.issueNumber} was already open; no conversation notification was created.`);
    }
  } catch (error) {
    const semanticError = toApplicationError(error, 'provider.unavailable', 'Unable to synchronize the issue state after the new commit.');
    logError(semanticError);
    result.push(
      new Result({
        id: taskId,
        success: false,
        executed: true,
        steps: ["Tried to synchronize issue state after the new commit, but there was a problem."],
        errors: [semanticError],
      }),
    );
  }
  return result;
}
