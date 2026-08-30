import type { Execution } from '../../../data/model/execution';
import { Result } from '../../../data/model/result';
import type { FindingsQueryPort } from '../../ports/agent_findings_ports';
import type { IssueDescriptionQueryPort } from '../../ports/issue_description_ports';
export interface RecommendStepsWorkflowDependencies {
    issueDescriptionQueryPort: IssueDescriptionQueryPort;
    aiRepository: FindingsQueryPort;
}
/** Runs the recommendation policy and agent interaction for an issue. */
export declare function runRecommendStepsWorkflow(param: Execution, taskId: string, dependencies: RecommendStepsWorkflowDependencies): Promise<Result[]>;
