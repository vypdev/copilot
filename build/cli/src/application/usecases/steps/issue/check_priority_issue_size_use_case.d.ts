import { Execution } from "../../../../data/model/execution";
import { Result } from "../../../../data/model/result";
import { ParamUseCase } from "../../base/param_usecase";
import type { ProjectBoardPriorityPort } from './priority_size_check_use_case';
export declare class CheckPriorityIssueSizeUseCase implements ParamUseCase<Execution, Result[]> {
    private readonly projectBoardPriorityPort;
    taskId: string;
    constructor(projectBoardPriorityPort: ProjectBoardPriorityPort);
    invoke(param: Execution): Promise<Result[]>;
}
