import { Result } from '../../data/model/result';
import type { DeploymentOrchestrationContext } from '../ports/deployment_orchestration_ports';
import { logDebugInfo, logError } from '../ports/logging_ports';
import type { ParamUseCase } from './base/param_usecase';
import { toApplicationError } from '../errors/application_error';
import type { BugbotReviewOperationContext } from './steps/commit/bugbot/bugbot_review_operation_context';
import type { ThinkContext } from './steps/common/think_workflow';
import type {
  BranchObservationContext,
  DeploymentPublicationContext,
  InactivityContext,
  InitialSetupContext,
  IssueCommentActionContext,
  ProgressContext,
  RecommendStepsContext,
  RecommendStepsOutcome,
  RecommendationStatePatch,
} from './push_single_action_contexts';

export type SingleActionDispatch =
  | { readonly kind: 'invalid'; readonly action: string }
  | { readonly kind: 'publish-github-action'; readonly action: string; readonly input: DeploymentPublicationContext }
  | { readonly kind: 'create-release'; readonly action: string; readonly input: DeploymentPublicationContext }
  | { readonly kind: 'create-tag'; readonly action: string; readonly input: DeploymentPublicationContext }
  | { readonly kind: 'think'; readonly action: string; readonly input: ThinkContext }
  | { readonly kind: 'initial-setup'; readonly action: string; readonly input: InitialSetupContext }
  | { readonly kind: 'check-progress'; readonly action: string; readonly input: ProgressContext }
  | { readonly kind: 'detect-potential-problems'; readonly action: string; readonly input: BugbotReviewOperationContext }
  | { readonly kind: 'recommend-steps'; readonly action: string; readonly input: RecommendStepsContext }
  | { readonly kind: 'close-inactive-issues'; readonly action: string; readonly input: InactivityContext }
  | { readonly kind: 'publish-issue-comment'; readonly action: string; readonly input: IssueCommentActionContext }
  | { readonly kind: 'observe-branch-sync'; readonly action: string; readonly input: BranchObservationContext }
  | { readonly kind: 'deployment-orchestration'; readonly action: string; readonly input: DeploymentOrchestrationContext };

export interface SingleActionWorkflowPorts {
  publishGithubActionUseCase?: ParamUseCase<DeploymentPublicationContext, Result[]>;
  createReleaseUseCase?: ParamUseCase<DeploymentPublicationContext, Result[]>;
  createTagUseCase?: ParamUseCase<DeploymentPublicationContext, Result[]>;
  thinkUseCase: ParamUseCase<ThinkContext, Result[]>;
  initialSetupUseCase: ParamUseCase<InitialSetupContext, Result[]>;
  checkProgressUseCase: ParamUseCase<ProgressContext, Result[]>;
  detectPotentialProblemsUseCase: ParamUseCase<BugbotReviewOperationContext, Result[]>;
  recommendStepsUseCase: ParamUseCase<RecommendStepsContext, RecommendStepsOutcome>;
  closeInactiveIssuesUseCase?: ParamUseCase<InactivityContext, Result[]>;
  publishIssueCommentUseCase?: ParamUseCase<IssueCommentActionContext, Result[]>;
  observeBranchSyncUseCase?: ParamUseCase<BranchObservationContext, Result[]>;
  deploymentOrchestrationUseCase?: ParamUseCase<DeploymentOrchestrationContext, Result[]>;
}

export interface SingleActionWorkflowOutcome {
  readonly results: readonly Result[];
  readonly configurationPatch?: RecommendationStatePatch;
}

export async function runSingleActionWorkflow(
  dispatch: SingleActionDispatch,
  taskId: string,
  ports: SingleActionWorkflowPorts,
): Promise<SingleActionWorkflowOutcome> {
  if (dispatch.kind === 'invalid') {
    logDebugInfo(`Single action is not valid: ${dispatch.action}. Skipping.`);
    return workflowOutcome([]);
  }
  logDebugInfo(`SingleAction: dispatching to handler for action: ${dispatch.action}.`);

  try {
    switch (dispatch.kind) {
      case 'publish-github-action': return workflowOutcome(await invokeOptional(ports.publishGithubActionUseCase, dispatch.input));
      case 'create-release': return workflowOutcome(await invokeOptional(ports.createReleaseUseCase, dispatch.input));
      case 'create-tag': return workflowOutcome(await invokeOptional(ports.createTagUseCase, dispatch.input));
      case 'think': return workflowOutcome(await ports.thinkUseCase.invoke(dispatch.input));
      case 'initial-setup': return workflowOutcome(await ports.initialSetupUseCase.invoke(dispatch.input));
      case 'check-progress': return workflowOutcome(await ports.checkProgressUseCase.invoke(dispatch.input));
      case 'detect-potential-problems': return workflowOutcome(await ports.detectPotentialProblemsUseCase.invoke(dispatch.input));
      case 'recommend-steps': {
        const outcome = await ports.recommendStepsUseCase.invoke(dispatch.input);
        return workflowOutcome(outcome.results, outcome.configurationPatch);
      }
      case 'close-inactive-issues': return workflowOutcome(await invokeOptional(ports.closeInactiveIssuesUseCase, dispatch.input));
      case 'publish-issue-comment': return workflowOutcome(await invokeOptional(ports.publishIssueCommentUseCase, dispatch.input));
      case 'observe-branch-sync': return workflowOutcome(await invokeOptional(ports.observeBranchSyncUseCase, dispatch.input));
      case 'deployment-orchestration': return workflowOutcome(await invokeOptional(ports.deploymentOrchestrationUseCase, dispatch.input));
    }
  } catch (error) {
    return workflowOutcome(singleActionFailure(dispatch.action, taskId, error));
  }
}

async function invokeOptional<T>(port: ParamUseCase<T, Result[]> | undefined, input: T): Promise<Result[]> {
  return port ? port.invoke(input) : [];
}

function workflowOutcome(results: readonly Result[], configurationPatch?: RecommendationStatePatch): SingleActionWorkflowOutcome {
  return Object.freeze({
    results: Object.freeze([...results]),
    ...(configurationPatch ? { configurationPatch: Object.freeze({ ...configurationPatch }) } : {}),
  });
}

function singleActionFailure(action: string, taskId: string, error: unknown): Result[] {
  const semanticError = toApplicationError(error, 'workflow.failed', `Single action ${action} failed.`);
  logError(semanticError);
  return [new Result({
    id: taskId,
    success: false,
    executed: true,
    steps: [`Error executing single action: ${action}.`],
    errors: [semanticError],
  })];
}
