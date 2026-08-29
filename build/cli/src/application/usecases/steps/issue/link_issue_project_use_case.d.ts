import { Execution } from "../../../../data/model/execution";
import { Result } from "../../../../data/model/result";
import type { IssueIdentityQueryPort } from "../../../../application/ports/issue_identity_ports";
import type { ProjectBoardCommandPort } from "../../../../application/ports/project_board_command_ports";
import type { ProjectBoardLinkPort } from "../../../../application/ports/project_board_link_ports";
import type { EventualConsistencyDelayPort } from "../../../../application/ports/eventual_consistency_ports";
import { ParamUseCase } from "../../base/param_usecase";
export declare class LinkIssueProjectUseCase implements ParamUseCase<Execution, Result[]> {
    private readonly issueRepository;
    private readonly projectCommandRepository;
    private readonly projectLinkRepository;
    private readonly eventualConsistencyDelayPort;
    taskId: string;
    constructor(issueRepository: IssueIdentityQueryPort, projectCommandRepository: ProjectBoardCommandPort, projectLinkRepository: ProjectBoardLinkPort, eventualConsistencyDelayPort: EventualConsistencyDelayPort);
    invoke(param: Execution): Promise<Result[]>;
}
