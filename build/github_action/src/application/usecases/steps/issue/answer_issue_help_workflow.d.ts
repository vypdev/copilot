import type { Execution } from '../../../../data/model/execution';
import { Result } from '../../../../data/model/result';
import type { FindingsQueryPort } from '../../../ports/agent_findings_ports';
import type { IssueNotificationPort } from '../../../ports/issue_lifecycle_ports';
export interface AnswerIssueHelpWorkflowDependencies {
    issueNotificationPort: IssueNotificationPort;
    aiRepository: FindingsQueryPort;
}
/** Posts one contextual answer for a newly opened question/help issue. */
export declare function runAnswerIssueHelpWorkflow(param: Execution, dependencies: AnswerIssueHelpWorkflowDependencies): Promise<Result[]>;
