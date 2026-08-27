import { Execution } from "../../../../data/model/execution";
import { Result } from "../../../../data/model/result";
import type { IssueClosurePort } from "../../../../application/ports/issue_lifecycle_ports";
import { ParamUseCase } from "../../base/param_usecase";
export declare class CloseIssueAfterMergingUseCase implements ParamUseCase<Execution, Result[]> {
    private readonly issueRepository;
    taskId: string;
    constructor(issueRepository: IssueClosurePort);
    invoke(param: Execution): Promise<Result[]>;
}
