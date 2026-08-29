import { Execution } from "../../../../data/model/execution";
import { Result } from "../../../../data/model/result";
import type { ProjectBoardCommandPort } from "../../../ports/project_board_command_ports";
import type { ProjectBoardLinkPort } from "../../../ports/project_board_link_ports";
import type { EventualConsistencyDelayPort } from "../../../ports/eventual_consistency_ports";
import { ParamUseCase } from "../../base/param_usecase";
export declare class LinkPullRequestProjectUseCase implements ParamUseCase<Execution, Result[]> {
    private readonly projectBoardCommandPort;
    private readonly projectBoardLinkPort;
    private readonly eventualConsistencyDelayPort;
    taskId: string;
    constructor(projectBoardCommandPort: ProjectBoardCommandPort, projectBoardLinkPort: ProjectBoardLinkPort, eventualConsistencyDelayPort: EventualConsistencyDelayPort);
    invoke(param: Execution): Promise<Result[]>;
}
