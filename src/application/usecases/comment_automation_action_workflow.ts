import { Result } from "../../data/model/result";
import type { Execution } from "../../data/model/execution";
import type { AuthenticatedUserPort } from "../ports/authenticated_user_ports";
import type { BugbotFindingResolutionPorts } from "../ports/bugbot_finding_resolution_ports";
import type { GitCommitPort } from "../ports/git_ports";
import type { CommentAutomationOptions } from "./comment_automation_contracts";
import type { BugbotFixIntentPayload } from "./steps/commit/bugbot/bugbot_fix_intent_payload";
import { commitAutofixAndResolveFindings } from "./steps/commit/bugbot/commit_autofix_and_resolve_workflow";
import { commitUserRequestIfSuccessful } from "./steps/commit/bugbot/commit_user_request_workflow";
import { logInfo } from "../ports/logging_ports";

export type CommentAutomationAction = "autofix" | "do-user-request" | "review" | "think";

export interface CommentAutomationActionPorts {
  authenticatedUserPort: AuthenticatedUserPort;
  bugbotResolutionPorts: BugbotFindingResolutionPorts;
  gitCommitPort: GitCommitPort;
}

/** Runs the selected mutating action and returns any result records it produces. */
export async function runCommentAutomationAction(
  param: Execution,
  options: CommentAutomationOptions,
  route: CommentAutomationAction,
  intentPayload: BugbotFixIntentPayload | undefined,
  ports: CommentAutomationActionPorts,
): Promise<Result[]> {
  if (route === "review") return runReviewAction(param, options);
  if (route === "autofix") return runAutofixAction(param, options, intentPayload, ports);
  if (route === "do-user-request") return runDoUserRequestAction(param, options, intentPayload, ports);
  return [];
}

async function runReviewAction(
  param: Execution,
  options: CommentAutomationOptions,
): Promise<Result[]> {
  if (!options.reviewPotentialProblemsUseCase) {
    return [new Result({
      id: `${options.taskId}.Review`,
      success: false,
      executed: false,
      errors: ["Read-only review is not available in this composition."],
    })];
  }
  logInfo("Running natural-language read-only review.");
  return options.reviewPotentialProblemsUseCase.invoke(param);
}

async function runAutofixAction(
  param: Execution,
  options: CommentAutomationOptions,
  intentPayload: BugbotFixIntentPayload | undefined,
  ports: CommentAutomationActionPorts,
): Promise<Result[]> {
  if (!intentPayload) return [];
  logInfo("Running bugbot autofix.");
  const autofixResults = await options.autofixUseCase.invoke({
    execution: param,
    targetFindingIds: intentPayload.targetFindingIds,
    userComment: options.userComment,
    context: intentPayload.context,
    branchOverride: intentPayload.branchOverride,
  });
  const resolutionErrors = await commitAutofixAndResolveFindings(
    param,
    intentPayload,
    autofixResults,
    ports.authenticatedUserPort,
    ports.bugbotResolutionPorts,
    ports.gitCommitPort,
  );
  if (resolutionErrors.length > 0) {
    autofixResults.push(
      new Result({
        id: `${options.taskId}.AutofixPostflight`,
        success: false,
        executed: true,
        steps: [
          "Autofix postflight failed: commit/push or finding reconciliation did not complete.",
        ],
        errors: resolutionErrors,
      }),
    );
  }
  return autofixResults;
}

async function runDoUserRequestAction(
  param: Execution,
  options: CommentAutomationOptions,
  intentPayload: BugbotFixIntentPayload | undefined,
  ports: CommentAutomationActionPorts,
): Promise<Result[]> {
  if (!intentPayload) return [];
  logInfo("Running do user request.");
  const doResults = await options.doUserRequestUseCase.invoke({
    execution: param,
    userComment: intentPayload.requestText?.trim() || options.userComment,
    branchOverride: intentPayload.branchOverride,
  });
  const commitResults = await commitUserRequestIfSuccessful(
    param,
    intentPayload.branchOverride,
    doResults,
    ports.authenticatedUserPort,
    ports.gitCommitPort,
  );
  return [...doResults, ...commitResults];
}
