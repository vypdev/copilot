import { Result } from '../../data/model/result';
import type { Execution } from '../../data/model/execution';
import type { ActorAuthorizationPort } from '../ports/actor_authorization_ports';
import type { CommentAutomationOptions } from './comment_automation_contracts';
import type { ParsedCopilotCommand } from '../../domain/copilot_command';
/** Executes deterministic /copilot commands without routing them through intent detection. */
export declare function runExplicitCommentCommand(param: Execution, options: CommentAutomationOptions, command: ParsedCopilotCommand, actorAuthorizationPort: ActorAuthorizationPort): Promise<Result[] | undefined>;
export declare function invalidCommentCommandResult(taskId: string, reason: string): Result;
