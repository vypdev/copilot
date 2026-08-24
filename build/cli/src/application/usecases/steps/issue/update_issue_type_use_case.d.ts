import { Execution } from "../../../../data/model/execution";
import { Result } from "../../../../data/model/result";
import type { IssueTypeAssignmentPort } from "../../../../application/ports/issue_management_ports";
import { ParamUseCase } from "../../base/param_usecase";
export declare class UpdateIssueTypeUseCase implements ParamUseCase<Execution, Result[]> {
    private readonly issueRepository;
    taskId: string;
    constructor(issueRepository: IssueTypeAssignmentPort);
    invoke(param: Execution): Promise<Result[]>;
}
