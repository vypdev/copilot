import { Execution } from "../../../../data/model/execution";
import { Result } from "../../../../data/model/result";
import type { IssueNotificationPort } from "../../../../application/ports/issue_lifecycle_ports";
import { ParamUseCase } from "../../base/param_usecase";
export declare class NotifyNewCommitOnIssueUseCase implements ParamUseCase<Execution, Result[]> {
    private readonly issueRepository;
    taskId: string;
    constructor(issueRepository: IssueNotificationPort);
    private mergeBranchPattern;
    private ghAction;
    private separator;
    invoke(param: Execution): Promise<Result[]>;
}
