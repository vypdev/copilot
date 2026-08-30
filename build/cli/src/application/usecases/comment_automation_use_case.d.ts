import type { Execution } from '../../data/model/execution';
import { Result } from '../../data/model/result';
import type { AuthenticatedUserPort } from '../ports/authenticated_user_ports';
import type { ActorAuthorizationPort } from '../ports/actor_authorization_ports';
import type { BugbotFindingResolutionPorts } from '../ports/bugbot_finding_resolution_ports';
import type { CommentAutomationOptions } from './comment_automation_contracts';
export type { CommentAutomationOptions } from "./comment_automation_contracts";
export declare function runCommentAutomation(param: Execution, options: CommentAutomationOptions, actorAuthorizationPort: ActorAuthorizationPort, authenticatedUserPort: AuthenticatedUserPort, bugbotResolutionPorts: BugbotFindingResolutionPorts): Promise<Result[]>;
