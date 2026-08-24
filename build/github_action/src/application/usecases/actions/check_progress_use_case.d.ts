import { Execution } from '../../../data/model/execution';
import { Result } from '../../../data/model/result';
import { ParamUseCase } from '../base/param_usecase';
import type { FindingsQueryPort } from '../../ports/agent_findings_ports';
import type { IssueDescriptionQueryPort } from '../../../application/ports/issue_description_ports';
import type { IssueLabelsPort, IssueProgressPort } from '../../../application/ports/issue_management_ports';
import type { PullRequestBranchQueryPort } from '../../../application/ports/pull_request_branch_ports';
import type { BranchListQueryPort } from '../../../application/ports/branch_lifecycle_ports';
export declare class CheckProgressUseCase implements ParamUseCase<Execution, Result[]> {
    private readonly issueRepository;
    private readonly branchRepository;
    private readonly pullRequestRepository;
    taskId: string;
    private aiRepository;
    constructor(issueRepository: IssueDescriptionQueryPort & IssueLabelsPort & IssueProgressPort, branchRepository: BranchListQueryPort, pullRequestRepository: PullRequestBranchQueryPort, aiRepository: FindingsQueryPort);
    invoke(param: Execution): Promise<Result[]>;
    /**
     * Calls the OpenCode agent once and returns parsed progress, summary, and reasoning.
     * HTTP-level retries are handled by the findings capability transport (OPENCODE_MAX_RETRIES).
     */
    private fetchProgressAttempt;
}
