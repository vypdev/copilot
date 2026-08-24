import { Execution } from "../../../../data/model/execution";
import { Result } from "../../../../data/model/result";
import type { ProjectBoardCommandPort } from "../../../../application/ports/project_board_command_ports";
import { ParamUseCase } from "../../base/param_usecase";
export declare class MoveIssueToInProgressUseCase implements ParamUseCase<Execution, Result[]> {
    private readonly projectRepository;
    taskId: string;
    constructor(projectRepository: ProjectBoardCommandPort);
    invoke(param: Execution): Promise<Result[]>;
}
