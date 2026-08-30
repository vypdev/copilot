import type { Execution } from "../../data/model/execution";
import type { Result } from "../../data/model/result";
import type { ActorAuthorizationPort } from "../ports/actor_authorization_ports";
import { logInfo } from "../ports/logging_ports";
import { getBugbotFixIntentPayload } from "./steps/commit/bugbot/bugbot_fix_intent_payload";
import { resolveCommentAutomationRoute, type CommentAutomationRoute } from "./comment_automation_route_policy";
import type { BugbotFixIntentPayload } from "./steps/commit/bugbot/bugbot_fix_intent_payload";
import type { CommentAutomationOptions } from "./comment_automation_contracts";

export interface CommentAutomationDecision {
  intentResults: Result[];
  intentPayload: BugbotFixIntentPayload | undefined;
  route: CommentAutomationRoute;
}

export async function resolveCommentAutomationDecision(
  param: Execution,
  options: CommentAutomationOptions,
  actorAuthorizationPort: ActorAuthorizationPort,
): Promise<CommentAutomationDecision> {
  logInfo("Running bugbot fix intent detection (before Think).");
  const intentResults = await options.intentUseCase.invoke(param);
  const intentPayload = getBugbotFixIntentPayload(intentResults);
  const route = resolveCommentAutomationRoute(
    intentPayload,
    await actorAuthorizationPort.isActorAllowedToModifyFiles(
      param.owner,
      param.actor,
      param.tokens.token,
    ),
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
