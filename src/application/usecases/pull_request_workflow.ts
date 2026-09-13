import { Result } from "../../data/model/result";
import { logDebugInfo, logError } from "../ports/logging_ports";
import type { ParamUseCase } from "./base/param_usecase";
import type { PullRequestWorkflowSteps } from "./pull_request_workflow_steps";
import { ApplicationError } from '../errors/application_error';
import type { BoundActorAuthorizationPort } from '../ports/actor_authorization_ports';
import type { BugbotReviewOperationContext } from './steps/commit/bugbot/bugbot_review_operation_context';
import type { UpdateTitleContext } from './steps/common/update_title_workflow';
import type { ProjectContentLinkContext } from './steps/common/project_content_link_workflow';
import type {
  PullRequestDescriptionRequest,
  PullRequestWorkflowStepContexts,
} from './pull_request_workflow_context';

export interface PullRequestWorkflowRouteContext {
  readonly actor: string;
  readonly membersOnly: boolean;
  readonly action: string;
  readonly opened: boolean;
  readonly synchronize: boolean;
  readonly closed: boolean;
  readonly merged: boolean;
  readonly automaticDescription: boolean;
  readonly reviewable: boolean;
  readonly review: BugbotReviewOperationContext;
}

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
  context: PullRequestWorkflowRouteContext,
  taskId: string,
  ports: PullRequestWorkflowPorts,
): Promise<Result[]> {
  try {
    logPullRequestState(context);
    const agentAllowed = await canUseAgent(context, ports.actorAuthorizationPort);
    if (context.opened) {
      const results = await ports.workflowSteps.updateTitle.invoke(ports.sharedContexts.title);
      results.push(...(await ports.workflowSteps.assignMemberToIssue.invoke(ports.sharedContexts.steps.assignment)));
      results.push(...(await ports.workflowSteps.assignReviewersToIssue.invoke(ports.sharedContexts.steps.reviewers)));
      results.push(...(await ports.workflowSteps.linkPullRequestProject.invoke(ports.sharedContexts.projectLink)));
      results.push(...(await ports.workflowSteps.linkPullRequestIssue.invoke(ports.sharedContexts.steps.linkIssue)));
      results.push(...(await ports.workflowSteps.syncSizeAndProgressLabels.invoke(ports.sharedContexts.steps.syncLabels)));
      results.push(...(await ports.workflowSteps.checkPriorityPullRequestSize.invoke(ports.sharedContexts.steps.priority)));
      if (agentAllowed && context.automaticDescription) {
        results.push(...(await ports.updatePullRequestDescriptionUseCase.invoke({
          context: ports.sharedContexts.steps.description,
          trigger: 'automatic',
        })));
      }
      if (agentAllowed) results.push(...(await runPullRequestReview(context, ports)));
      return results;
    }

    if (context.synchronize) {
      const results = agentAllowed && context.automaticDescription
        ? await ports.updatePullRequestDescriptionUseCase.invoke({
            context: ports.sharedContexts.steps.description,
            trigger: 'automatic',
          })
        : [];
      if (agentAllowed) results.push(...(await runPullRequestReview(context, ports)));
      return results;
    }

    if (context.action === 'edited') {
      return ports.workflowSteps.updateTitle.invoke(ports.sharedContexts.title);
    }

    if (context.closed && context.merged) {
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
  context: PullRequestWorkflowRouteContext,
  authorization: BoundActorAuthorizationPort | undefined,
): Promise<boolean> {
  if (!context.membersOnly) return true;
  if (!authorization) return false;
  return authorization.isActorAllowedToModifyFiles(context.actor);
}

async function runPullRequestReview(
  context: PullRequestWorkflowRouteContext,
  ports: PullRequestWorkflowPorts,
): Promise<Result[]> {
  if (!ports.reviewPotentialProblemsUseCase || !context.reviewable) return [];
  return ports.reviewPotentialProblemsUseCase.invoke(context.review);
}

function logPullRequestState(context: PullRequestWorkflowRouteContext): void {
  logDebugInfo(`PR action ${context.action}`);
  logDebugInfo(`PR isOpened ${context.opened}`);
  logDebugInfo(`PR isMerged ${context.merged}`);
  logDebugInfo(`PR isClosed ${context.closed}`);
}
