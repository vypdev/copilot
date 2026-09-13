import type { Execution } from "../../data/model/execution";
import { Result } from "../../data/model/result";
import { logDebugInfo, logError } from "../ports/logging_ports";
import type { ParamUseCase } from "./base/param_usecase";
import type { PullRequestWorkflowSteps } from "./pull_request_workflow_steps";
import { ApplicationError } from '../errors/application_error';
import type { BoundActorAuthorizationPort } from '../ports/actor_authorization_ports';
import type { BugbotReviewOperationContext } from './steps/commit/bugbot/bugbot_review_operation_context';
import { projectBugbotReviewOperationContext } from './steps/commit/bugbot/bugbot_review_operation_context';
import type { UpdateTitleContext } from './steps/common/update_title_workflow';
import type { ProjectContentLinkContext } from './steps/common/project_content_link_workflow';
import type {
  PullRequestDescriptionRequest,
  PullRequestWorkflowStepContexts,
} from './pull_request_workflow_context';

export interface PullRequestSharedStepContexts {
  readonly title: UpdateTitleContext;
  readonly projectLink: ProjectContentLinkContext;
  readonly steps: PullRequestWorkflowStepContexts;
}

export interface PullRequestWorkflowPorts {
  updatePullRequestDescriptionUseCase: ParamUseCase<PullRequestDescriptionRequest, Result[]>;
  reviewPotentialProblemsUseCase?: ParamUseCase<BugbotReviewOperationContext, Result[]>;
  workflowSteps: PullRequestWorkflowSteps;
  actorAuthorizationPort?: BoundActorAuthorizationPort;
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
      const results = await ports.workflowSteps.updateTitle.invoke(ports.sharedContexts.title);
      results.push(...(await ports.workflowSteps.assignMemberToIssue.invoke(ports.sharedContexts.steps.assignment)));
      results.push(...(await ports.workflowSteps.assignReviewersToIssue.invoke(ports.sharedContexts.steps.reviewers)));
      results.push(...(await ports.workflowSteps.linkPullRequestProject.invoke(ports.sharedContexts.projectLink)));
      results.push(...(await ports.workflowSteps.linkPullRequestIssue.invoke(ports.sharedContexts.steps.linkIssue)));
      results.push(...(await ports.workflowSteps.syncSizeAndProgressLabels.invoke(ports.sharedContexts.steps.syncLabels)));
      results.push(...(await ports.workflowSteps.checkPriorityPullRequestSize.invoke(ports.sharedContexts.steps.priority)));
      if (agentAllowed && shouldUpdatePullRequestDescriptionAutomatically(param)) {
        results.push(...(await ports.updatePullRequestDescriptionUseCase.invoke({
          context: ports.sharedContexts.steps.description,
          trigger: 'automatic',
        })));
      }
      if (agentAllowed) results.push(...(await runPullRequestReview(param, ports)));
      return results;
    }

    if (param.pullRequest.isSynchronize) {
      const results = agentAllowed && shouldUpdatePullRequestDescriptionAutomatically(param)
        ? await ports.updatePullRequestDescriptionUseCase.invoke({
            context: ports.sharedContexts.steps.description,
            trigger: 'automatic',
          })
        : [];
      if (agentAllowed) results.push(...(await runPullRequestReview(param, ports)));
      return results;
    }

    if (param.pullRequest.action === 'edited') {
      return ports.workflowSteps.updateTitle.invoke(ports.sharedContexts.title);
    }

    if (param.pullRequest.isClosed && param.pullRequest.isMerged) {
      return ports.workflowSteps.closeIssueAfterMerging.invoke(ports.sharedContexts.steps.closeIssue);
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
  authorization: BoundActorAuthorizationPort | undefined,
): Promise<boolean> {
  if (!param.ai.getAiMembersOnly()) return true;
  if (!authorization) return false;
  return authorization.isActorAllowedToModifyFiles(param.actor);
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

function logPullRequestState(param: Execution): void {
  logDebugInfo(`PR action ${param.pullRequest.action}`);
  logDebugInfo(`PR isOpened ${param.pullRequest.isOpened}`);
  logDebugInfo(`PR isMerged ${param.pullRequest.isMerged}`);
  logDebugInfo(`PR isClosed ${param.pullRequest.isClosed}`);
}
