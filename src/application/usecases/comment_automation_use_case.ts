import { Execution } from "../../data/model/execution";
import { Result } from "../../data/model/result";
import { logError, logInfo } from "../ports/logging_ports";
import {
  getBugbotFixIntentPayload,
  canRunBugbotAutofix,
  canRunDoUserRequest,
} from "./steps/commit/bugbot/bugbot_fix_intent_payload";
import { resolveCommentAutomationRoute } from "./comment_automation_route_policy";
import type { AuthenticatedUserPort } from "../ports/authenticated_user_ports";
import type { ActorAuthorizationPort } from "../ports/actor_authorization_ports";
import type { BugbotFindingResolutionPorts } from "../ports/bugbot_finding_resolution_ports";
import { runCommentAutomationAction } from "./comment_automation_action_workflow";
import type { CommentAutomationOptions } from "./comment_automation_contracts";

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
    results.push(...(await options.languageUseCase.invoke(param)));

    logInfo("Running bugbot fix intent detection (before Think).");
    const intentResults = await options.intentUseCase.invoke(param);
    results.push(...intentResults);
    const intentPayload = getBugbotFixIntentPayload(intentResults);
    const runAutofix = canRunBugbotAutofix(intentPayload);

    if (intentPayload) {
      logInfo(
        `Bugbot fix intent: isFixRequest=${intentPayload.isFixRequest}, isDoRequest=${intentPayload.isDoRequest}, targetFindingIds=${intentPayload.targetFindingIds?.length ?? 0}.`,
      );
    } else {
      logInfo("Bugbot fix intent: no payload from intent detection.");
    }

    const allowedToModifyFiles =
      await actorAuthorizationPort.isActorAllowedToModifyFiles(
        param.owner,
        param.actor,
        param.tokens.token,
      );
    const canModifyFiles = runAutofix || canRunDoUserRequest(intentPayload);
    const route = resolveCommentAutomationRoute(
      intentPayload,
      allowedToModifyFiles,
    );
    if (!allowedToModifyFiles && canModifyFiles) {
      logInfo(
        "Skipping file-modifying use cases: user is not an org member or repo owner.",
      );
    }

    if (route === "think") {
      logInfo(
        "Skipping bugbot autofix (no fix request, no targets, or no context).",
      );
    }

    if (route !== "think") {
      results.push(
        ...(await runCommentAutomationAction(
          param,
          options,
          route,
          intentPayload,
          {
            authenticatedUserPort,
            bugbotResolutionPorts,
            gitCommitPort: options.gitCommitPort,
          },
        )),
      );
    }

    const ranAutofix = route === "autofix";
    const ranDoRequest = route === "do-user-request";
    if (!ranAutofix && !ranDoRequest) {
      logInfo("Running ThinkUseCase (no file-modifying action ran).");
      results.push(...(await options.thinkUseCase.invoke(param)));
    }
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
