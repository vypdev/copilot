import type { Execution } from '../../data/model/execution';
import type { Result } from '../../data/model/result';
import type { ActorAuthorizationPort } from '../ports/actor_authorization_ports';
import type { AuthenticatedUserPort } from '../ports/authenticated_user_ports';
import type { BugbotFindingResolutionPorts } from '../ports/bugbot_finding_resolution_ports';
import type { CommentAutomationOptions } from './comment_automation_contracts';
/** Runs the natural-language comment pipeline after deterministic commands are excluded. */
export declare function runNaturalLanguageCommentAutomation(param: Execution, options: CommentAutomationOptions, actorAuthorizationPort: ActorAuthorizationPort, languageResults: readonly Result[], ports: {
    authenticatedUserPort: AuthenticatedUserPort;
    bugbotResolutionPorts: BugbotFindingResolutionPorts;
}): Promise<Result[]>;
