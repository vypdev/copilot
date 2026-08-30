import type { Execution } from '../../data/model/execution';
import { Result } from '../../data/model/result';
import { logError, logInfo } from '../ports/logging_ports';
import type { AuthenticatedUserPort } from '../ports/authenticated_user_ports';
import type { ActorAuthorizationPort } from '../ports/actor_authorization_ports';
import type { BugbotFindingResolutionPorts } from '../ports/bugbot_finding_resolution_ports';
import type { CommentAutomationOptions } from './comment_automation_contracts';
import { parseCopilotCommand } from '../../domain/copilot_command';
import { invalidCommentCommandResult, runExplicitCommentCommand } from './comment_automation_command_workflow';
import { runNaturalLanguageCommentAutomation } from './comment_automation_natural_language_workflow';

export type { CommentAutomationOptions } from "./comment_automation_contracts";

class CommentAutomationError extends Error {
  constructor() {
    super("Comment automation failed.");
    this.name = "CommentAutomationError";
  }
}

export async function runCommentAutomation(
  param: Execution,
  options: CommentAutomationOptions,
  actorAuthorizationPort: ActorAuthorizationPort,
  authenticatedUserPort: AuthenticatedUserPort,
  bugbotResolutionPorts: BugbotFindingResolutionPorts,
): Promise<Result[]> {
  logInfo(`${options.taskId} started.`);
  let languageResults: Result[] = [];
  try {
    const command = parseCopilotCommand(options.userComment);
    if (command.kind === 'invalid') {
      return [invalidCommentCommandResult(options.taskId, command.reason)];
    }
    if (command.kind === 'command') {
      const explicitResults = await runExplicitCommentCommand(param, options, command.command, actorAuthorizationPort);
      if (explicitResults) return explicitResults;
    }
    languageResults = await options.languageUseCase.invoke(param);
    return await runNaturalLanguageCommentAutomation(param, options, actorAuthorizationPort, languageResults, {
      authenticatedUserPort,
      bugbotResolutionPorts,
    });
  } catch {
    const error = new CommentAutomationError();
    logError(error);
    return [...languageResults, new Result({
        id: options.taskId,
        success: false,
        executed: true,
        steps: [error.message],
        errors: [error],
      })];
  }
}
