import type { Execution } from '../../../data/model/execution';
import { Result } from '../../../data/model/result';
import type { IssueLabelsPort, IssueProgressPort } from '../../ports/issue_management_ports';
import type { PullRequestBranchQueryPort } from '../../ports/pull_request_branch_ports';
import { type ProgressAnalysisDependencies } from './progress_analysis_workflow';
export interface CheckProgressWorkflowDependencies extends ProgressAnalysisDependencies {
    issueRepository: IssueLabelsPort & IssueProgressPort;
    pullRequestRepository: PullRequestBranchQueryPort;
}
/** Publishes a completed progress assessment after the analysis workflow succeeds. */
export declare function runCheckProgressWorkflow(param: Execution, taskId: string, dependencies: CheckProgressWorkflowDependencies): Promise<Result[]>;
