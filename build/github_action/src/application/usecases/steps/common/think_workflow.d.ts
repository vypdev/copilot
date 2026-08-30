import type { Execution } from '../../../../data/model/execution';
import { Result } from '../../../../data/model/result';
import type { FindingsQueryPort } from '../../../ports/agent_findings_ports';
import type { IssueDescriptionQueryPort } from '../../../ports/issue_description_ports';
import type { IssueNotificationPort } from '../../../ports/issue_lifecycle_ports';
export interface ThinkWorkflowDependencies {
    issueDescriptionQueryPort: IssueDescriptionQueryPort;
    issueNotificationPort: IssueNotificationPort;
    aiRepository: FindingsQueryPort;
}
export declare function runThinkWorkflow(param: Execution, taskId: string, dependencies: ThinkWorkflowDependencies): Promise<Result[]>;
