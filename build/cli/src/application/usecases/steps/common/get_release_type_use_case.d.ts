import { Execution } from "../../../../data/model/execution";
import { Result } from "../../../../data/model/result";
import type { IssueDescriptionQueryPort } from "../../../../application/ports/issue_description_ports";
import { ParamUseCase } from "../../base/param_usecase";
export declare class GetReleaseTypeUseCase implements ParamUseCase<Execution, Result[]> {
    private readonly issueRepository;
    taskId: string;
    constructor(issueRepository: IssueDescriptionQueryPort);
    invoke(param: Execution): Promise<Result[]>;
}
