import { Result } from "../../../../data/model/result";
import type { BoundIssuePushNotificationPort } from "../../../../application/ports/issue_lifecycle_ports";
import type { CommitNotificationContext } from '../../push_single_action_contexts';
import { logInfo } from "../../../ports/logging_ports";
import { getTaskEmoji } from "../../../../utils/task_emoji";
import { ParamUseCase } from "../../base/param_usecase";
import { runNotifyNewCommitOnIssueWorkflow } from "./notify_new_commit_on_issue_workflow";

export class NotifyNewCommitOnIssueUseCase implements ParamUseCase<CommitNotificationContext, Result[]> {
  taskId: string = "NotifyNewCommitOnIssueUseCase";

  constructor(private readonly issueRepository: BoundIssuePushNotificationPort) {}

  async invoke(param: CommitNotificationContext): Promise<Result[]> {
    logInfo(`${getTaskEmoji(this.taskId)} Executing ${this.taskId}.`);
    return runNotifyNewCommitOnIssueWorkflow(param, this.taskId, this.issueRepository);
  }
}
