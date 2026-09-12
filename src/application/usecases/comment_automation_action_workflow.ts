import { Result } from "../../data/model/result";
import type { CommentAutomationOptions } from "./comment_automation_contracts";
import type { CommentAutomationContext } from './comment_automation_context';
import type { BugbotFixIntentPayload } from "./steps/commit/bugbot/bugbot_fix_intent_payload";
import { commitAutofixAndResolveFindings } from "./steps/commit/bugbot/commit_autofix_and_resolve_workflow";
import { commitUserRequestIfSuccessful } from "./steps/commit/bugbot/commit_user_request_workflow";
import { logInfo } from "../ports/logging_ports";
import { ApplicationError, toApplicationError } from "../errors/application_error";

export type CommentAutomationAction = "autofix" | "do-user-request" | "review" | "think";

/** Runs the selected mutating action and returns any result records it produces. */
export async function runCommentAutomationAction(
  param: CommentAutomationContext,
  options: CommentAutomationOptions,
  route: CommentAutomationAction,
  intentPayload: BugbotFixIntentPayload | undefined,
): Promise<Result[]> {
  if (route === "review") return runReviewAction(param, options);
  if (route === "autofix") return runAutofixAction(param, options, intentPayload);
  if (route === "do-user-request") return runDoUserRequestAction(param, options, intentPayload);
  return [];
}

async function runReviewAction(
  param: CommentAutomationContext,
  options: CommentAutomationOptions,
): Promise<Result[]> {
  if (!options.reviewPotentialProblemsUseCase) {
    return [new Result({
      id: `${options.taskId}.Review`,
      success: false,
      executed: false,
      errors: [new ApplicationError('configuration.unsupported', "Read-only review is not available in this composition.")],
    })];
  }
  logInfo("Running natural-language read-only review.");
  return options.reviewPotentialProblemsUseCase.invoke(param.bugbot.review);
}

async function runAutofixAction(
  param: CommentAutomationContext,
  options: CommentAutomationOptions,
  intentPayload: BugbotFixIntentPayload | undefined,
): Promise<Result[]> {
  if (!intentPayload) return [];
  if (param.bugbot.publicationMode === 'dry-run') {
    return [new Result({
      id: `${options.taskId}.Autofix`,
      success: true,
      executed: false,
      steps: ['Bugbot autofix skipped because analysis-only dry-run mode is enabled.'],
      payload: { dryRun: true },
    })];
  }
  logInfo("Running bugbot autofix.");
  const autofixResults = await options.autofixUseCase.invoke({
    operation: param.bugbot.autofix,
    targetFindingIds: intentPayload.targetFindingIds,
    userComment: param.userComment,
    context: intentPayload.context,
    branchOverride: intentPayload.branchOverride,
  });
  const resolutionErrors = await commitAutofixAndResolveFindings(
    param.bugbot.commit,
    intentPayload,
    autofixResults,
    options.bugbotGitMutationPort,
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
        errors: resolutionErrors.map(error => toApplicationError(
          error,
          'workflow.failed',
          'Autofix postflight could not complete.',
        )),
      }),
    );
    return autofixResults;
  }
  if (autofixResults.at(-1)?.success && options.reviewPotentialProblemsUseCase) {
    logInfo('Running an independent post-autofix review because bot-authored push workflows are intentionally discarded.');
    autofixResults.push(...await options.reviewPotentialProblemsUseCase.invoke(
      param.bugbot.review,
    ));
  }
  return autofixResults;
}

async function runDoUserRequestAction(
  param: CommentAutomationContext,
  options: CommentAutomationOptions,
  intentPayload: BugbotFixIntentPayload | undefined,
): Promise<Result[]> {
  if (!intentPayload) return [];
  logInfo("Running do user request.");
  const doResults = await options.doUserRequestUseCase.invoke({
    userComment: intentPayload.requestText?.trim() || param.userComment,
    branchOverride: intentPayload.branchOverride,
  });
  const commitResults = await commitUserRequestIfSuccessful(
    param.bugbot.commit,
    intentPayload.branchOverride,
    doResults,
    options.bugbotGitMutationPort,
  );
  return [...doResults, ...commitResults];
}
