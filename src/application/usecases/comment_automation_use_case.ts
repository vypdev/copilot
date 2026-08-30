import { Execution } from "../../data/model/execution";
import { Result } from "../../data/model/result";
import { logError, logInfo } from "../ports/logging_ports";
import type { AuthenticatedUserPort } from "../ports/authenticated_user_ports";
import type { ActorAuthorizationPort } from "../ports/actor_authorization_ports";
import type { BugbotFindingResolutionPorts } from "../ports/bugbot_finding_resolution_ports";
import type { CommentAutomationOptions } from "./comment_automation_contracts";
import { resolveCommentAutomationDecision } from "./comment_automation_decision_workflow";
import { completeCommentAutomation } from './comment_automation_completion_workflow';
import { parseCopilotCommand } from '../../domain/copilot_command';

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
  const results: Result[] = [];
  try {
    const command = parseCopilotCommand(options.userComment);
    if (command.kind === 'invalid') {
      return [new Result({
        id: options.taskId,
        success: false,
        executed: false,
        errors: [command.reason],
      })];
    }

    if (command.kind === 'command' && command.command.name === 'dismiss') {
      const allowed = await actorAuthorizationPort.isActorAllowedToModifyFiles(
        param.owner,
        param.actor,
        param.tokens.token,
      );
      if (!allowed || !options.dismissBugbotFindingsUseCase) {
        return [new Result({
          id: options.taskId,
          success: true,
          executed: false,
          steps: ['Explicit dismiss command skipped because the actor is not authorized or dismissal is unavailable.'],
        })];
      }
      return options.dismissBugbotFindingsUseCase.invoke({
        execution: param,
        findingIds: command.command.arguments,
      });
    }

    if (command.kind === 'command' && command.command.name !== 'fix') {
      results.push(new Result({
        id: `${options.taskId}.ExplicitCommand`,
        success: true,
        executed: true,
        steps: [`Executing explicit /copilot ${command.command.name} command.`],
      }));
      results.push(...(await options.thinkUseCase.invoke(param)));
      return results;
    }

    results.push(...(await options.languageUseCase.invoke(param)));

    const decision = await resolveCommentAutomationDecision(
      param,
      options,
      actorAuthorizationPort,
    );
    results.push(...decision.intentResults);
    results.push(...(await completeCommentAutomation(param, options, decision, {
      authenticatedUserPort,
      bugbotResolutionPorts,
    })));
  } catch {
    const error = new CommentAutomationError();
    logError(error);
    results.push(
      new Result({
        id: options.taskId,
        success: false,
        executed: true,
        steps: [error.message],
        errors: [error],
      }),
    );
  }
  return results;
}
