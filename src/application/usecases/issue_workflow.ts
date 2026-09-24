import { Result } from "../../data/model/result";
import { logError } from "../ports/logging_ports";
import type { ParamUseCase } from "./base/param_usecase";
import type { IssueWorkflowSteps } from "./issue_workflow_steps";
import { buildCopilotWelcomeResult } from '../policies/copilot_interaction_policy';
import {
  hasOwnedPrimaryIssuePublication,
  hasPrimaryIssuePublication,
} from '../policies/semantic_result_publication_policy';
import type { BoundActorAuthorizationPort } from '../ports/actor_authorization_ports';
import type { BoundIssueCommentQueryPort } from '../ports/issue_lifecycle_ports';
import { ApplicationError, toApplicationError } from '../errors/application_error';
import type { CheckPermissionsContext } from './steps/common/check_permissions_workflow';
import type { UpdateTitleContext } from './steps/common/update_title_workflow';
import type { ProjectContentLinkContext } from './steps/common/project_content_link_workflow';
import type {
  AnswerIssueHelpContext,
  BranchConfigurationPatch,
  IssueWorkflowStepContexts,
} from './issue_workflow_context';
import type {
  RecommendStepsContext,
  RecommendStepsOutcome,
  RecommendationStatePatch,
} from './push_single_action_contexts';
import type { PreBranchSddContext, PreBranchSddGateUseCase } from './sdd/pre_branch_sdd_gate_use_case';

export interface IssueWorkflowRouteContext {
  readonly started: boolean;
  readonly cleanIssueBranches: boolean;
  readonly branchRequired: boolean;
  readonly sddRequired?: boolean;
  readonly sddPublished?: boolean;
  readonly branchName?: string;
  readonly issueNumber?: number;
  readonly sddContext?: PreBranchSddContext;
  readonly membersOnly: boolean;
  readonly actor: string;
  readonly newIssue: boolean;
  readonly onboardingEligible: boolean;
  readonly tokenUser?: string;
  readonly recommendation?: 'answer-help' | 'recommend';
  readonly recommendSteps: RecommendStepsContext;
}

export interface IssueWorkflowOutcome {
  readonly results: readonly Result[];
  readonly branchConfigurationPatch?: BranchConfigurationPatch;
  readonly recommendationStatePatch?: RecommendationStatePatch;
}

export interface IssueSharedStepContexts {
  readonly permissions: CheckPermissionsContext;
  readonly title: UpdateTitleContext;
  readonly projectLink: ProjectContentLinkContext;
  readonly steps: IssueWorkflowStepContexts;
}

export interface IssueWorkflowPorts {
  recommendStepsUseCase: ParamUseCase<RecommendStepsContext, RecommendStepsOutcome>;
  answerIssueHelpUseCase: ParamUseCase<AnswerIssueHelpContext, Result[]>;
  workflowSteps: IssueWorkflowSteps;
  actorAuthorizationPort?: BoundActorAuthorizationPort;
  issueCommentQueryPort: BoundIssueCommentQueryPort;
  preBranchSddGate?: PreBranchSddGateUseCase;
  sharedContexts: IssueSharedStepContexts;
}

/** Coordinates issue lifecycle steps in their required sequential order. */
export async function runIssueWorkflow(
  context: IssueWorkflowRouteContext,
  taskId: string,
  ports: IssueWorkflowPorts,
): Promise<IssueWorkflowOutcome> {
  const results: Result[] = [];
  let branchConfigurationPatch: BranchConfigurationPatch | undefined;
  let recommendationStatePatch: RecommendationStatePatch | undefined;
  const permissionResult = await ports.workflowSteps.checkPermissions.invoke(ports.sharedContexts.permissions);
  const lastAction = permissionResult[permissionResult.length - 1];
  if (!lastAction) {
    const permissionError = new ApplicationError('provider.contract-invalid', "Permission check returned no result.");
    logError(`Unable to continue ${taskId}: ${permissionError.message}`);
    return issueWorkflowOutcome([
      new Result({
        id: taskId,
        success: false,
        executed: true,
        steps: ["Unable to verify whether the issue action is authorized."],
        errors: [permissionError],
      }),
    ]);
  }

  if (!lastAction.success && lastAction.executed) {
    results.push(...permissionResult);
    results.push(...(await ports.workflowSteps.closeNotAllowedIssue.invoke(ports.sharedContexts.steps.closeNotAllowed)));
    return issueWorkflowOutcome(results);
  }

  if (context.started && context.branchRequired && context.cleanIssueBranches && !context.sddRequired) {
    results.push(...(await ports.workflowSteps.removeIssueBranches.invoke(ports.sharedContexts.steps.removeIssueBranches)));
  }

  results.push(...(await ports.workflowSteps.assignMemberToIssue.invoke(ports.sharedContexts.steps.assignment)));
  results.push(...(await ports.workflowSteps.updateIssueType.invoke(ports.sharedContexts.steps.issueType)));
  results.push(...(await ports.workflowSteps.linkIssueProject.invoke(ports.sharedContexts.projectLink)));
  results.push(...(await ports.workflowSteps.checkPriorityIssueSize.invoke(ports.sharedContexts.steps.priority)));
  let sddPublished = false;
  let sddWaiting = false;
  if (context.started && context.sddRequired) {
    if (!ports.preBranchSddGate || !context.sddContext) {
      results.push(new Result({
        id: 'PreBranchSddGateUseCase', success: false, executed: true,
        steps: ['The pre-branch SDD gate is enabled but unavailable in this Action installation.'],
        errors: [new ApplicationError('configuration.invalid', 'The pre-branch SDD gate is not configured.')],
      }));
      sddWaiting = true;
    } else {
      const gate = await ports.preBranchSddGate.begin(context.sddContext);
      results.push(...gate.results);
      if (gate.status === 'published') {
        sddPublished = true;
        branchConfigurationPatch = { workingBranch: gate.branchName };
      } else if (gate.status === 'drafted') {
        const existingBranch = gate.record.branchName;
        const prepared = existingBranch ? undefined
          : await ports.workflowSteps.prepareBranches.invoke(ports.sharedContexts.steps.prepareBranches);
        branchConfigurationPatch = existingBranch ? { workingBranch: existingBranch } : prepared?.configurationPatch;
        if (prepared) results.push(...prepared.results);
        const branchName = branchConfigurationPatch?.workingBranch;
        if (branchName && (!prepared || prepared.results.every(result => result.success))) {
          const published = await ports.preBranchSddGate.publish(context.sddContext, gate, branchName);
          results.push(...published.results);
          sddPublished = published.status === 'published';
          sddWaiting = !sddPublished;
        } else {
          sddWaiting = true;
          results.push(new Result({
            id: 'PreBranchSddGateUseCase', success: false, executed: true,
            steps: ['The validated SDD remains unpublished because branch preparation did not complete.'],
            errors: [new ApplicationError('workflow.failed', 'The linked branch is not ready for its first SDD commit.')],
          }));
        }
      } else {
        sddWaiting = true;
      }
    }
  } else if (context.started && context.branchRequired) {
    const outcome = await ports.workflowSteps.prepareBranches.invoke(ports.sharedContexts.steps.prepareBranches);
    branchConfigurationPatch = outcome.configurationPatch;
    results.push(...outcome.results);
  }
  let branchReady = false;
  if (ports.workflowSteps.reconcileBranchReadiness && context.issueNumber !== undefined) {
    const readinessResults = await ports.workflowSteps.reconcileBranchReadiness.invoke({
      issueNumber: context.issueNumber,
      branchName: branchConfigurationPatch?.workingBranch ?? context.branchName,
      sddRequired: context.sddRequired ?? false,
      sddPublished,
    });
    results.push(...readinessResults);
    branchReady = readinessResults.some(result => result.success && result.payload !== undefined);
  }
  const titleContext = ports.sharedContexts.title;
  const reconciledTitle = titleContext.kind === 'issue' && ports.workflowSteps.reconcileBranchReadiness
    ? { ...titleContext, labelFacts: { ...titleContext.labelFacts, containsBranchedLabel: branchReady } }
    : titleContext;
  results.push(...(await ports.workflowSteps.updateTitle.invoke(reconciledTitle)));
  if (context.started && context.branchRequired && !sddWaiting && branchReady) {
    results.push(...(await ports.workflowSteps.removeNotNeededBranches.invoke(ports.sharedContexts.steps.removeObsoleteBranches)));
    results.push(...(await ports.workflowSteps.deployAdded.invoke(ports.sharedContexts.steps.deployAdded)));
  }

  const agentAllowed = !context.membersOnly || Boolean(
    ports.actorAuthorizationPort
    && await ports.actorAuthorizationPort.isActorAllowedToUseMemberOnlyAutomation(context.actor),
  );
  const recommendation = context.started && !sddWaiting && (!context.sddRequired || branchReady) && agentAllowed
    ? context.recommendation : undefined;
  if (recommendation) {
    const recommendationOutcome = recommendation === 'answer-help'
      ? { results: await ports.answerIssueHelpUseCase.invoke(ports.sharedContexts.steps.answerHelp) }
      : await ports.recommendStepsUseCase.invoke(context.recommendSteps);
    const recommendationResults = recommendationOutcome.results;
    recommendationStatePatch = 'configurationPatch' in recommendationOutcome
      ? recommendationOutcome.configurationPatch
      : undefined;
    results.push(...recommendationResults);
    await appendWelcomeFallback(results, recommendationResults, context, ports);
  } else if (context.newIssue && context.onboardingEligible) {
    await appendWelcomeFallback(results, [], context, ports);
  }
  return issueWorkflowOutcome(results, branchConfigurationPatch, recommendationStatePatch);
}

async function appendWelcomeFallback(
  results: Result[],
  recommendationResults: readonly Result[],
  context: IssueWorkflowRouteContext,
  ports: IssueWorkflowPorts,
): Promise<void> {
  if (!context.newIssue || !context.onboardingEligible || hasPrimaryIssuePublication(recommendationResults)) return;
  if (context.tokenUser?.trim()) {
    try {
      const comments = await ports.issueCommentQueryPort.listIssueComments(context.recommendSteps.issueNumber);
      if (hasOwnedPrimaryIssuePublication(comments, context.recommendSteps.issueNumber, context.tokenUser)) return;
    } catch (error) {
      logError(toApplicationError(
        error,
        'provider.unavailable',
        'Unable to verify whether the issue already has a primary response; welcome publication was omitted.',
      ));
      return;
    }
  }
  results.push(buildCopilotWelcomeResult(context.tokenUser, ports.sharedContexts.steps.answerHelp.locale));
}

function issueWorkflowOutcome(
  results: readonly Result[],
  branchConfigurationPatch?: BranchConfigurationPatch,
  recommendationStatePatch?: RecommendationStatePatch,
): IssueWorkflowOutcome {
  return Object.freeze({
    results: Object.freeze([...results]),
    ...(branchConfigurationPatch ? { branchConfigurationPatch: Object.freeze({ ...branchConfigurationPatch }) } : {}),
    ...(recommendationStatePatch ? { recommendationStatePatch: Object.freeze({ ...recommendationStatePatch }) } : {}),
  });
}
