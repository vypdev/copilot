import { Execution } from '../../../data/model/execution';
import { Result } from '../../../data/model/result';
import type { FindingsQueryPort } from '../../ports/agent_findings_ports';
import type { IssueDescriptionQueryPort } from '../../ports/issue_description_ports';
import type { IssueLabelsPort, IssueProgressPort } from '../../ports/issue_management_ports';
import type { PullRequestBranchQueryPort } from '../../ports/pull_request_branch_ports';
import type { BranchListQueryPort } from '../../ports/branch_lifecycle_ports';
import { ParamUseCase } from '../base/param_usecase';
/** Application boundary for assessing and publishing issue progress. */
export declare class CheckProgressUseCase implements ParamUseCase<Execution, Result[]> {
    private readonly issueRepository;
    private readonly branchRepository;
    private readonly pullRequestRepository;
    private readonly aiRepository;
    taskId: string;
    constructor(issueRepository: IssueDescriptionQueryPort & IssueLabelsPort & IssueProgressPort, branchRepository: BranchListQueryPort, pullRequestRepository: PullRequestBranchQueryPort, aiRepository: FindingsQueryPort);
    invoke(param: Execution): Promise<Result[]>;
}
