import { Execution } from "../../../../data/model/execution";
import { Result } from "../../../../data/model/result";
import type { IssueTitlePort } from "../../../../application/ports/issue_title_ports";
import { ParamUseCase } from "../../base/param_usecase";
export declare class UpdateTitleUseCase implements ParamUseCase<Execution, Result[]> {
    private readonly issueRepository;
    taskId: string;
    constructor(issueRepository: IssueTitlePort);
    invoke(param: Execution): Promise<Result[]>;
}
