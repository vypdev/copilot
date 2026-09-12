import type { Result } from "../../data/model/result";
import type { BoundActorAuthorizationPort } from "../ports/actor_authorization_ports";
import { logInfo } from "../ports/logging_ports";
import { getBugbotFixIntentPayload } from "./steps/commit/bugbot/bugbot_fix_intent_payload";
import { resolveCommentAutomationRoute, type CommentAutomationRoute } from "./comment_automation_route_policy";
import type { BugbotFixIntentPayload } from "./steps/commit/bugbot/bugbot_fix_intent_payload";
import type { CommentAutomationOptions } from "./comment_automation_contracts";
import type { CommentAutomationContext } from './comment_automation_context';
import { containsBotMention } from '../../domain/copilot_comment_request';
import { parseCopilotCommand } from '../../domain/copilot_command';

export interface CommentAutomationDecision {
  readonly intentResults: readonly Result[];
  readonly intentPayload: BugbotFixIntentPayload | undefined;
  readonly route: CommentAutomationRoute;
}

export async function resolveCommentAutomationDecision(
  param: CommentAutomationContext,
  options: CommentAutomationOptions,
  actorAuthorizationPort: BoundActorAuthorizationPort,
): Promise<CommentAutomationDecision> {
  logInfo("Running bugbot fix intent detection (before Think).");
  const intentResults = await options.intentUseCase.invoke(param.bugbot.fixIntent);
  const intentPayload = getBugbotFixIntentPayload(intentResults);
  const parsedCommand = parseCopilotCommand(param.userComment);
  const explicitMutationCommand = parsedCommand.kind === 'command'
    && (parsedCommand.command.name === 'fix' || parsedCommand.command.name === 'implement');
  const route = resolveCommentAutomationRoute(
    intentPayload,
    await actorAuthorizationPort.isActorAllowedToModifyFiles(param.actor),
    containsBotMention(param.userComment, param.trustedBotLogin),
    explicitMutationCommand,
  );

  logIntent(intentPayload);
  return { intentResults, intentPayload, route };
}

function logIntent(intentPayload: BugbotFixIntentPayload | undefined): void {
  if (intentPayload) {
    logInfo(
      `Bugbot fix intent: isFixRequest=${intentPayload.isFixRequest}, isDoRequest=${intentPayload.isDoRequest}, targetFindingIds=${intentPayload.targetFindingIds?.length ?? 0}.`,
    );
  } else {
    logInfo("Bugbot fix intent: no payload from intent detection.");
  }
}
