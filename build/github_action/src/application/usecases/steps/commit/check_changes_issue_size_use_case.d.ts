import { Execution } from "../../../../data/model/execution";
import { Result } from "../../../../data/model/result";
import type { BranchChangeSizePort } from "../../../ports/branch_change_ports";
import { ProjectBoardCommandPort } from "../../../ports/project_board_command_ports";
import type { IssueLabelsPort } from "../../../ports/issue_management_ports";
import type { PullRequestBranchQueryPort } from "../../../ports/pull_request_branch_ports";
import { ParamUseCase } from "../../base/param_usecase";
export declare class CheckChangesIssueSizeUseCase implements ParamUseCase<Execution, Result[]> {
    private readonly projectBoardCommandPort;
    private readonly issueRepository;
    private readonly pullRequestRepository;
    private readonly branchChangeSizePort;
    taskId: string;
    constructor(projectBoardCommandPort: ProjectBoardCommandPort, issueRepository: IssueLabelsPort, pullRequestRepository: PullRequestBranchQueryPort, branchChangeSizePort: BranchChangeSizePort);
    invoke(param: Execution): Promise<Result[]>;
}
