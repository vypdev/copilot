import { Execution } from "../../../../data/model/execution";
import { Result } from "../../../../data/model/result";
import type { BranchListQueryPort, BranchNamePort } from "../../../ports/branch_lifecycle_ports";
import type { BranchPropagationDelayPort, CommitTagQueryPort, LinkedBranchCommandPort, RemoteBranchSyncPort } from "../../../ports/branch_preparation_ports";
import type { ProjectBoardCommandPort } from "../../../ports/project_board_command_ports";
import { ParamUseCase } from "../../base/param_usecase";
export declare class PrepareBranchesUseCase implements ParamUseCase<Execution, Result[]> {
    private readonly projectBoardPort;
    private readonly branchListQueryPort;
    private readonly branchNamePort;
    private readonly remoteBranchSyncPort;
    private readonly commitTagQueryPort;
    private readonly linkedBranchCommandPort;
    private readonly branchPropagationDelayPort;
    taskId: string;
    constructor(projectBoardPort: ProjectBoardCommandPort, branchListQueryPort: BranchListQueryPort, branchNamePort: BranchNamePort, remoteBranchSyncPort: RemoteBranchSyncPort, commitTagQueryPort: CommitTagQueryPort, linkedBranchCommandPort: LinkedBranchCommandPort, branchPropagationDelayPort: BranchPropagationDelayPort);
    invoke(param: Execution): Promise<Result[]>;
    private prepareManagedBranch;
    private buildCommitPrefix;
}
