import { Result } from '../../data/model/result';
import type { Execution } from '../../data/model/execution';
import type { AuthenticatedUserPort } from '../ports/authenticated_user_ports';
import type { BugbotFindingResolutionPorts } from '../ports/bugbot_finding_resolution_ports';
import type { CommentAutomationDecision } from './comment_automation_decision_workflow';
import type { CommentAutomationOptions } from './comment_automation_contracts';
export declare function completeCommentAutomation(param: Execution, options: CommentAutomationOptions, decision: CommentAutomationDecision, ports: {
    authenticatedUserPort: AuthenticatedUserPort;
    bugbotResolutionPorts: BugbotFindingResolutionPorts;
}): Promise<Result[]>;
