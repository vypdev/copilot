import type { Execution } from "../../../../data/model/execution";
import { Result } from "../../../../data/model/result";
import type { IssueNotificationPort } from "../../../../application/ports/issue_lifecycle_ports";
import { logInfo } from "../../../ports/logging_ports";
import { getTaskEmoji } from "../../../../utils/task_emoji";
import { ParamUseCase } from "../../base/param_usecase";
import { runNotifyNewCommitOnIssueWorkflow } from "./notify_new_commit_on_issue_workflow";

export class NotifyNewCommitOnIssueUseCase implements ParamUseCase<Execution, Result[]> {
  taskId: string = "NotifyNewCommitOnIssueUseCase";

  constructor(private readonly issueRepository: IssueNotificationPort) {}

  async invoke(param: Execution): Promise<Result[]> {
    logInfo(`${getTaskEmoji(this.taskId)} Executing ${this.taskId}.`);
    return runNotifyNewCommitOnIssueWorkflow(param, this.taskId, this.issueRepository);
  }
}
