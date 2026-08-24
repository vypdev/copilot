import { Execution } from "../../../../data/model/execution";
import type { IssueNotificationPort } from "../../../ports/issue_lifecycle_ports";
import { ParamUseCase } from "../../base/param_usecase";
/**
 * Publish the resume of actions
 */
export declare class PublishResultUseCase implements ParamUseCase<Execution, void> {
    private readonly issueNotificationPort;
    taskId: string;
    constructor(issueNotificationPort: IssueNotificationPort);
    invoke(param: Execution): Promise<void>;
}
