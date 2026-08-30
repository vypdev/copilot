import type { Execution } from "../../../../data/model/execution";
import { Result } from "../../../../data/model/result";
import type { IssueNotificationPort } from "../../../../application/ports/issue_lifecycle_ports";
export declare function runNotifyNewCommitOnIssueWorkflow(param: Execution, taskId: string, issueRepository: IssueNotificationPort): Promise<Result[]>;
