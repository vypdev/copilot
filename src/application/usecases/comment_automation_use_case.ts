import { Execution } from "../../data/model/execution";
import { Result } from "../../data/model/result";
import { logError, logInfo } from "../../utils/logger";
import { ParamUseCase } from "./base/param_usecase";
import type { BugbotAutofixParam } from "./steps/commit/bugbot/bugbot_autofix_use_case";
import {
  getBugbotFixIntentPayload,
  canRunBugbotAutofix,
  canRunDoUserRequest,
} from "./steps/commit/bugbot/bugbot_fix_intent_payload";
import { resolveCommentAutomationRoute } from "./comment_automation_route_policy";
import { commitAutofixAndResolveFindings } from "./steps/commit/bugbot/commit_autofix_and_resolve_workflow";
import { commitUserRequestIfSuccessful } from "./steps/commit/bugbot/commit_user_request_workflow";
import type { DoUserRequestParam } from "./steps/commit/user_request_use_case";
import type { AuthenticatedUserPort } from "../ports/authenticated_user_ports";
import type { ActorAuthorizationPort } from "../ports/actor_authorization_ports";
import type { BugbotFindingResolutionPorts } from "../ports/bugbot_finding_resolution_ports";
import type { GitCommitPort } from "../ports/git_ports";

export interface CommentAutomationOptions {
  taskId: string;
  languageUseCase: ParamUseCase<Execution, Result[]>;
  intentUseCase: ParamUseCase<Execution, Result[]>;
  thinkUseCase: ParamUseCase<Execution, Result[]>;
  autofixUseCase: ParamUseCase<BugbotAutofixParam, Result[]>;
  doUserRequestUseCase: ParamUseCase<DoUserRequestParam, Result[]>;
  userComment: string;
  gitCommitPort: GitCommitPort;
}

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

    if (route === "autofix" && intentPayload) {
      const payload = intentPayload;
      logInfo("Running bugbot autofix.");
      const autofixResults = await options.autofixUseCase.invoke({
        execution: param,
        targetFindingIds: payload.targetFindingIds,
        userComment: options.userComment,
        context: payload.context,
        branchOverride: payload.branchOverride,
      });
      results.push(...autofixResults);
      const resolutionErrors = await commitAutofixAndResolveFindings(
        param,
        payload,
        autofixResults,
        authenticatedUserPort,
        bugbotResolutionPorts,
        options.gitCommitPort,
      );
      if (resolutionErrors.length > 0) {
        results.push(
          new Result({
            id: `${options.taskId}.ResolveFindings`,
            success: false,
            executed: true,
            steps: [
              "Autofix succeeded, but one or more findings could not be marked as resolved.",
            ],
            errors: resolutionErrors,
          }),
        );
      }
    } else if (route === "do-user-request") {
      const payload = intentPayload!;
      logInfo("Running do user request.");
      const doResults = await options.doUserRequestUseCase.invoke({
        execution: param,
        userComment: options.userComment,
        branchOverride: payload.branchOverride,
      });
      results.push(...doResults);
      await commitUserRequestIfSuccessful(
        param,
        payload.branchOverride,
        doResults,
        authenticatedUserPort,
        options.gitCommitPort,
      );
    } else if (route === "think") {
      logInfo(
        "Skipping bugbot autofix (no fix request, no targets, or no context).",
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
