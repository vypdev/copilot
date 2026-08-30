import type { Execution } from '../../../../data/model/execution';
import { Result } from '../../../../data/model/result';
import type { FindingsQueryPort } from '../../../ports/agent_findings_ports';
import type { IssueDescriptionQueryPort } from '../../../ports/issue_description_ports';
import type { IssueNotificationPort } from '../../../ports/issue_lifecycle_ports';
import type { ThinkRequestDecision } from './think_request_policy';
import type { AgentTask } from '../../../../domain/agent';
export interface ThinkAnswerDependencies {
    issueDescriptionQueryPort: IssueDescriptionQueryPort;
    issueNotificationPort: IssueNotificationPort;
    aiRepository: FindingsQueryPort;
}
type ReadyThinkRequest = Extract<ThinkRequestDecision, {
    kind: 'ready';
}>;
export declare function runThinkAnswerWorkflow(param: Execution, taskId: string, request: ReadyThinkRequest, dependencies: ThinkAnswerDependencies, agentTask: AgentTask): Promise<Result[]>;
export {};
