import { Execution } from "../../data/model/execution";
import { Result } from "../../data/model/result";
import { logError, logInfo } from "../ports/logging_ports";
import {
  canRunBugbotAutofix,
  canRunDoUserRequest,
} from "./steps/commit/bugbot/bugbot_fix_intent_payload";
import type { AuthenticatedUserPort } from "../ports/authenticated_user_ports";
import type { ActorAuthorizationPort } from "../ports/actor_authorization_ports";
import type { BugbotFindingResolutionPorts } from "../ports/bugbot_finding_resolution_ports";
import { runCommentAutomationAction } from "./comment_automation_action_workflow";
import type { CommentAutomationOptions } from "./comment_automation_contracts";
import { resolveCommentAutomationDecision } from "./comment_automation_decision_workflow";

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

    const decision = await resolveCommentAutomationDecision(
      param,
      options,
      actorAuthorizationPort,
    );
    results.push(...decision.intentResults);
    if (decision.route === "think") {
      const intentPayload = decision.intentPayload;
      if (intentPayload && (canRunBugbotAutofix(intentPayload) || canRunDoUserRequest(intentPayload))) {
        logInfo(
          "Skipping file-modifying use cases: user is not an org member or repo owner.",
        );
      }
    }

    if (decision.route === "think") {
      logInfo(
        "Skipping bugbot autofix (no fix request, no targets, or no context).",
      );
    }

    if (decision.route !== "think") {
      results.push(
        ...(await runCommentAutomationAction(
          param,
          options,
          decision.route,
          decision.intentPayload,
          {
            authenticatedUserPort,
            bugbotResolutionPorts,
            gitCommitPort: options.gitCommitPort,
          },
        )),
      );
    }

    const ranAutofix = decision.route === "autofix";
    const ranDoRequest = decision.route === "do-user-request";
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
