import { Result } from '../../data/model/result';
import { logError, logInfo } from '../ports/logging_ports';
import { isCopilotCommentRequest } from '../../domain/copilot_comment_request';
import type { BoundActorAuthorizationPort } from '../ports/actor_authorization_ports';
import type { CommentAutomationOptions } from './comment_automation_contracts';
import type { CommentAutomationContext } from './comment_automation_context';
import { parseCopilotCommand } from '../../domain/copilot_command';
import { invalidCommentCommandResult, runExplicitCommentCommand } from './comment_automation_command_workflow';
import { runNaturalLanguageCommentAutomation } from './comment_automation_natural_language_workflow';
import { ApplicationError } from '../errors/application_error';
import { isNaturalLanguageBranchSyncRequest } from '../../domain/branch_sync_command';
import { runBranchSyncCommand } from './branch_sync/branch_sync_comment_command';

export type { CommentAutomationOptions } from "./comment_automation_contracts";

export async function runCommentAutomation(
  param: CommentAutomationContext,
  options: CommentAutomationOptions,
  actorAuthorizationPort: BoundActorAuthorizationPort,
): Promise<Result[]> {
  logInfo(`${options.taskId} started.`);
  let languageResults: Result[] = [];
  try {
    const command = parseCopilotCommand(param.userComment);
    if (!isCopilotCommentRequest(param.userComment, param.trustedBotLogin)) {
      logInfo('Skipping comment automation because the comment does not address Copilot.');
      return [new Result({ id: options.taskId, success: true, executed: false })];
    }
    if (command.kind === 'invalid') {
      return [invalidCommentCommandResult(options.taskId, command.reason)];
    }
    const isPublicMetadataCommand = command.kind === 'command'
      && (command.command.name === 'help' || command.command.name === 'status');
    if (!isPublicMetadataCommand && param.membersOnly && !await actorAuthorizationPort.isActorAllowedToModifyFiles(param.actor)) {
      logInfo('Skipping agent automation because ai-members-only is enabled and the actor is not authorized.');
      return [new Result({ id: options.taskId, success: true, executed: false })];
    }
    if (command.kind === 'command') {
      const explicitResults = await runExplicitCommentCommand(param, options, command.command, actorAuthorizationPort);
      if (explicitResults) return explicitResults;
      // Explicit fix/implement commands are already mention-gated by their
      // deterministic prefix and still flow through structured intent parsing.
      return runNaturalLanguageCommentAutomation(param, options, actorAuthorizationPort, []);
    }
    if (isNaturalLanguageBranchSyncRequest(param.userComment, param.trustedBotLogin)) {
      return runBranchSyncCommand(param, options, [], actorAuthorizationPort);
    }
    languageResults = await options.languageUseCase.invoke(param.language);
    return await runNaturalLanguageCommentAutomation(param, options, actorAuthorizationPort, languageResults);
  } catch (cause) {
    const semanticError = new ApplicationError('workflow.failed', "Comment automation failed.", { cause });
    logError(semanticError);
    return [...languageResults, new Result({
        id: options.taskId,
        success: false,
        executed: true,
        steps: [semanticError.message],
        errors: [semanticError],
      })];
  }
}
