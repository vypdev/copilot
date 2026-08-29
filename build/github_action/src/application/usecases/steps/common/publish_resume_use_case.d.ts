import { Execution } from "../../../../data/model/execution";
import type { IssueNotificationPort } from "../../../ports/issue_lifecycle_ports";
import type { ApplicationLogReportPort } from "../../../ports/logging_ports";
import { ParamUseCase } from "../../base/param_usecase";
/**
 * Publish the resume of actions
 */
export declare class PublishResultUseCase implements ParamUseCase<Execution, void> {
    private readonly issueNotificationPort;
    private readonly logReport;
    taskId: string;
    constructor(issueNotificationPort: IssueNotificationPort, logReport?: ApplicationLogReportPort);
    invoke(param: Execution): Promise<void>;
}
