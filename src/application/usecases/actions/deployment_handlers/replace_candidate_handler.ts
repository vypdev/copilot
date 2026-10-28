import { SupersededDeploymentInvocationError } from '../../../services/deployment_state_boundary';
import { ApplicationError } from '../../../errors/application_error';
import type { DeploymentOrchestrationContext } from '../../../ports/deployment_orchestration_ports';
import {
  assessDeploymentCandidateReplacement,
  assessRecordedCandidateReplacementRecovery,
  isCandidateReplacementPreparationPhase,
  assessDeploymentCandidateReplacementState,
  buildReplacementDeploymentCandidate,
  isRecordedCandidateReplacement,
  type DeploymentCandidateReplacementRequest,
} from '../../../../domain/deployment_candidate_replacement';
import type { DeploymentOperationSnapshot, SupersededDeploymentCandidate } from '../../../../domain/deployment_operation';
import type { Result } from '../../../../data/model/result';
import { DeploymentOrchestrationRuntime, deploymentKind, deploymentSuccess } from '../../../services/deployment_orchestration_runtime';
import { PreparePromotionHandler } from './prepare_promotion_handler';

export class ReplaceCandidateHandler {
  constructor(private readonly runtime: DeploymentOrchestrationRuntime, private readonly prepare: PreparePromotionHandler) {}

  async invoke(context: DeploymentOrchestrationContext): Promise<Result> {
    const previous = context.currentConfiguration.deploymentOrchestration;
    if (!previous) return blocked('missing-operation');
    const input = context.singleAction;
    if (input.title || input.changelog || input.isPrepareDeploymentAction || input.isContinueDeploymentAction
      || input.isPublishedDeploymentAction || input.isFailedDeploymentAction) return blocked('ambiguous-command');
    const request: DeploymentCandidateReplacementRequest = {
      operationId: input.operationId, expectedRevision: input.replacementRevision ?? -1,
      version: input.version, candidateSha: input.candidateSha ?? '', reviewedSourceSha: input.reviewedSourceSha ?? '', productionBaseSha: input.productionBaseSha ?? '',
      confirmedUnpublished: input.confirmedUnpublished === true,
    };
    if (isRecordedCandidateReplacement(previous, request)) {
      if (!isCandidateReplacementPreparationPhase(previous)) {
        return deploymentSuccess(`Replacement was already recorded; the current operation is ${previous.phase}. No preparation or publication was repeated.`);
      }
      const predecessor = previous.supersededCandidates!.at(-1)!;
      await this.requireNativeAuthority(context, previous, request, predecessor);
      await this.runtime.publishSupersededCandidate(context, previous);
      return await this.prepare.invoke(context);
    }
    const stateProblem = assessDeploymentCandidateReplacementState(previous, request);
    if (stateProblem) return blocked(stateProblem);
    await this.requireNativeAuthority(context, previous, request);
    // Reread native source/base/PR/effects immediately before the revision-fenced write.
    await this.requireNativeAuthority(context, previous, request);
    const current = buildReplacementDeploymentCandidate(previous, request, this.runtime.dependencies.operationId());
    try {
      await this.runtime.persist(context, current);
    } catch (error) {
      if (error instanceof SupersededDeploymentInvocationError) throw error;
      context.currentConfiguration.deploymentOrchestration = previous;
      if (error instanceof ApplicationError) throw error;
      throw new ApplicationError('provider.unavailable',
        'Replacement persistence was not confirmed. Reinspect the launcher before replaying; publication was not started.', { retryable: true });
    }
    const persisted = context.currentConfiguration.deploymentOrchestration!;
    await this.runtime.publishSupersededCandidate(context, persisted);
    await this.runtime.publishDashboard(context, persisted);
    return await this.prepare.invoke(context);
  }

  private async requireNativeAuthority(
    context: DeploymentOrchestrationContext,
    previous: DeploymentOperationSnapshot,
    request: DeploymentCandidateReplacementRequest,
    predecessor?: SupersededDeploymentCandidate,
  ): Promise<void> {
    const inspection = this.runtime.dependencies.replacementInspection;
    const promotionPullRequest = predecessor?.promotionPullRequest ?? previous.promotionPullRequest;
    if (!inspection || promotionPullRequest === undefined) return blocked('missing-native-inspection');
    const kind = deploymentKind(context);
    const facts = await inspection.inspect({ issue: context.singleAction.issue,
      sourceBranch: previous.sourceBranch, sourceSha: predecessor?.sourceSha ?? previous.sourceSha, reviewedSourceSha: request.reviewedSourceSha,
      productionBranch: previous.productionBranch, promotionPullRequest,
      version: previous.version,
      preparation: { kind: predecessor ? 'recorded' : 'fresh', candidateSha: request.candidateSha },
      ...(predecessor ? { allowedCurrentPromotion: { operationId: previous.operationId,
        sourceSha: previous.sourceSha, pullRequest: previous.promotionPullRequest } } : {}),
    });
    const assessment = predecessor ? assessRecordedCandidateReplacementRecovery : assessDeploymentCandidateReplacement;
    const decision = assessment(previous, request, {
      repositoryFullName: `${context.owner}/${context.repo}`, issue: context.singleAction.issue, kind,
      sourceBranch: (kind === 'release' ? context.currentConfiguration.releaseBranch : context.currentConfiguration.hotfixBranch) ?? '',
      productionBranch: context.branches.defaultBranch,
    }, facts);
    if (decision.kind === 'blocked') return blocked(decision.reason);
  }
}

function blocked(reason: string): never {
  throw new ApplicationError('workflow.stale',
    `The unpublished candidate was not replaced (${reason}). Review the current operation, closed promotion, source and production base, then start complete fresh validation. Existing candidate identities and evidence were retained.`);
}
