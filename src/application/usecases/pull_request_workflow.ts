import type { Execution } from "../../data/model/execution";
import { Result } from "../../data/model/result";
import { logDebugInfo, logError } from "../ports/logging_ports";
import type { ParamUseCase } from "./base/param_usecase";
import type { PullRequestWorkflowSteps } from "./pull_request_workflow_steps";
import { ApplicationError } from '../errors/application_error';
import type { ActorAuthorizationPort } from '../ports/actor_authorization_ports';
import type { BugbotReviewOperationContext } from './steps/commit/bugbot/bugbot_review_operation_context';
import { projectBugbotReviewOperationContext } from './steps/commit/bugbot/bugbot_review_operation_context';
import type { UpdateTitleContext } from './steps/common/update_title_workflow';
import type { ProjectContentLinkContext } from './steps/common/project_content_link_workflow';

export interface PullRequestSharedStepContexts {
  readonly title: UpdateTitleContext;
  readonly projectLink: ProjectContentLinkContext;
}

export interface PullRequestWorkflowPorts {
  updatePullRequestDescriptionUseCase: ParamUseCase<Execution, Result[]>;
  reviewPotentialProblemsUseCase?: ParamUseCase<BugbotReviewOperationContext, Result[]>;
  workflowSteps: PullRequestWorkflowSteps;
  actorAuthorizationPort?: ActorAuthorizationPort;
  sharedContexts: PullRequestSharedStepContexts;
}

/** Coordinates pull-request lifecycle actions while preserving their sequential order. */
export async function runPullRequestWorkflow(
  param: Execution,
  taskId: string,
  ports: PullRequestWorkflowPorts,
): Promise<Result[]> {
  try {
    logPullRequestState(param);
    const agentAllowed = await canUseAgent(param, ports.actorAuthorizationPort);
    if (param.pullRequest.isOpened) {
      const remainingSteps: Array<ParamUseCase<Execution, Result[]>> = [
        ports.workflowSteps.linkPullRequestIssue,
        ports.workflowSteps.syncSizeAndProgressLabels,
        ports.workflowSteps.checkPriorityPullRequestSize,
      ];
      const results = await ports.workflowSteps.updateTitle.invoke(ports.sharedContexts.title);
      results.push(...(await ports.workflowSteps.assignMemberToIssue.invoke(param)));
      results.push(...(await ports.workflowSteps.assignReviewersToIssue.invoke(param)));
      results.push(...(await ports.workflowSteps.linkPullRequestProject.invoke(ports.sharedContexts.projectLink)));
      results.push(...(await runSteps(param, remainingSteps)));
      if (agentAllowed && shouldUpdatePullRequestDescriptionAutomatically(param)) {
        results.push(...(await ports.updatePullRequestDescriptionUseCase.invoke(param)));
      }
      if (agentAllowed) results.push(...(await runPullRequestReview(param, ports)));
      return results;
    }

    if (param.pullRequest.isSynchronize) {
      const results = agentAllowed && shouldUpdatePullRequestDescriptionAutomatically(param)
        ? await ports.updatePullRequestDescriptionUseCase.invoke(param)
        : [];
      if (agentAllowed) results.push(...(await runPullRequestReview(param, ports)));
      return results;
    }

    if (param.pullRequest.action === 'edited') {
      return ports.workflowSteps.updateTitle.invoke(ports.sharedContexts.title);
    }

    if (param.pullRequest.isClosed && param.pullRequest.isMerged) {
      return ports.workflowSteps.closeIssueAfterMerging.invoke(param);
    }
  } catch (cause) {
    const semanticError = new ApplicationError('workflow.failed', "Unable to process the pull request.", { cause });
    logError(semanticError);
    return [
      new Result({
        id: taskId,
        success: false,
        executed: true,
        steps: ["Unable to process the pull request."],
        errors: [semanticError],
      }),
    ];
  }
  return [];
}

async function canUseAgent(
  param: Execution,
  authorization: ActorAuthorizationPort | undefined,
): Promise<boolean> {
  if (!param.ai.getAiMembersOnly()) return true;
  if (!authorization) return false;
  return authorization.isActorAllowedToModifyFiles(
    param.owner,
    param.repo,
    param.actor,
    param.tokens.token,
  );
}

function shouldUpdatePullRequestDescriptionAutomatically(param: Execution): boolean {
  const mode = param.ai.getPullRequestDescriptionMode();
  return mode === 'replace' || mode === 'append';
}

async function runPullRequestReview(
  param: Execution,
  ports: PullRequestWorkflowPorts,
): Promise<Result[]> {
  if (!ports.reviewPotentialProblemsUseCase || !shouldReviewPullRequest(param)) return [];
  return ports.reviewPotentialProblemsUseCase.invoke(projectBugbotReviewOperationContext(param));
}

function shouldReviewPullRequest(param: Execution): boolean {
  return ['opened', 'reopened', 'synchronize'].includes(param.pullRequest.action);
}

async function runSteps(
  param: Execution,
  steps: Array<ParamUseCase<Execution, Result[]>>,
): Promise<Result[]> {
  const results: Result[] = [];
  for (const step of steps) results.push(...(await step.invoke(param)));
  return results;
}

function logPullRequestState(param: Execution): void {
  logDebugInfo(`PR action ${param.pullRequest.action}`);
  logDebugInfo(`PR isOpened ${param.pullRequest.isOpened}`);
  logDebugInfo(`PR isMerged ${param.pullRequest.isMerged}`);
  logDebugInfo(`PR isClosed ${param.pullRequest.isClosed}`);
}
