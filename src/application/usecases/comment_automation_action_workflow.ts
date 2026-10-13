import { Result } from "../../data/model/result";
import { IMPLEMENTATION_REPLY_RESULT_ID, type ImplementationResultProjection } from '../policies/implementation_result_policy';
import type { CommentAutomationOptions } from "./comment_automation_contracts";
import type { CommentAutomationContext } from './comment_automation_context';
import type { BugbotFixIntentPayload } from "./steps/commit/bugbot/bugbot_fix_intent_payload";
import { commitAutofixAndResolveFindings } from "./steps/commit/bugbot/commit_autofix_and_resolve_workflow";
import { commitUserRequestIfSuccessful } from "./steps/commit/bugbot/commit_user_request_workflow";
import { logInfo } from "../ports/logging_ports";
import { ApplicationError, toApplicationError } from "../errors/application_error";

import { resolveCommentMutationBranch } from './comment_mutation_target_workflow';

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
  let branchOverride: string;
  try {
    branchOverride = await resolveCommentMutationBranch(param, options);
    if (!branchOverride || (intentPayload.branchOverride && intentPayload.branchOverride !== branchOverride)) {
      throw new ApplicationError('workflow.stale', 'Autofix requires the exact current conversation branch.');
    }
  } catch (error) {
    return [new Result({ id: `${options.taskId}.Autofix`, success: false, executed: false,
      errors: [toApplicationError(error, 'provider.unavailable', 'The autofix branch could not be verified.')] })];
  }
  const verifiedIntent = { ...intentPayload, branchOverride };
  logInfo("Running bugbot autofix.");
  const autofixResults = await options.autofixUseCase.invoke({
    operation: param.bugbot.autofix,
    targetFindingIds: intentPayload.targetFindingIds,
    userComment: param.userComment,
    context: intentPayload.context,
    branchOverride,
  });
  let completedOutcome: 'changes-pushed' | 'no-changes' | undefined;
  const resolutionErrors = await commitAutofixAndResolveFindings(
    param.bugbot.commit,
    verifiedIntent,
    autofixResults,
    options.bugbotGitMutationPort,
    outcome => { completedOutcome = outcome; },
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
    let reviewResults = await options.reviewPotentialProblemsUseCase.invoke(
      param.bugbot.review,
    );
    if (reviewResults.some(isSupersededReviewResult)) {
      logInfo('Post-autofix review was superseded; reloading the current PR for one bounded read-only retry.');
      reviewResults = await options.reviewPotentialProblemsUseCase.invoke(param.bugbot.review);
    }
    autofixResults.push(...reviewResults);
  }
  if (completedOutcome) autofixResults.push(new Result({ id: 'CommentAutomation.FixReply', success: true, executed: true,
    payload: { publication: Object.freeze({ kind: 'fix-result', outcome: completedOutcome }) } }));
  return autofixResults;
}

function isSupersededReviewResult(result: Result): boolean {
  const payload = result.payload;
  return result.success && result.executed
    && payload !== null && typeof payload === 'object' && !Array.isArray(payload)
    && (payload as Record<string, unknown>).superseded === true;
}

async function runDoUserRequestAction(
  param: CommentAutomationContext,
  options: CommentAutomationOptions,
  intentPayload: BugbotFixIntentPayload | undefined,
): Promise<Result[]> {
  if (!intentPayload) return [];
  let branchOverride: string;
  try {
    branchOverride = await resolveCommentMutationBranch(param, options);
    if (!branchOverride || (intentPayload.branchOverride && intentPayload.branchOverride !== branchOverride)) {
      throw new ApplicationError('workflow.stale', 'Implementation requires the exact current conversation branch.');
    }
  } catch (error) {
    return [new Result({
      id: `${options.taskId}.Implementation`, success: false, executed: false,
      errors: [toApplicationError(error, 'provider.unavailable', 'The implementation branch could not be verified.')],
    })];
  }
  logInfo("Running do user request.");
  const doResults = await options.doUserRequestUseCase.invoke({
    userComment: intentPayload.requestText?.trim() || param.userComment,
    branchOverride,
  });
  if (!doResults.some(result => result.executed) || doResults.some(result => !result.success || result.errors.length > 0)) {
    return doResults;
  }
  const commitResults = await commitUserRequestIfSuccessful(
    param.bugbot.commit,
    branchOverride,
    doResults,
    options.bugbotGitMutationPort,
  );
  const results = [...doResults, ...commitResults];
  const committed = commitResults.find(result => result.id === 'DoUserRequestCommitAndPush');
  if (!committed || commitResults.some(result => !result.success || result.errors.length > 0)) return results;
  const outcome = (committed.payload as { commitOutcome?: unknown } | undefined)?.commitOutcome;
  if (outcome !== 'changes-pushed' && outcome !== 'no-changes') return results;
  const publication: ImplementationResultProjection = Object.freeze({
    kind: 'implementation-result', outcome, branch: branchOverride,
  });
  return [...results, new Result({ id: IMPLEMENTATION_REPLY_RESULT_ID, success: true, executed: true,
    payload: { publication } })];
}
