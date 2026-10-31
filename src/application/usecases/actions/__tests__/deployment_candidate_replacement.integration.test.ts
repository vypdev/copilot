import { Result } from "../../../../data/model/result";
import { DeploymentOrchestrationRuntime } from '../../../services/deployment_orchestration_runtime';
import { DeploymentStateBoundary } from '../../../services/deployment_state_boundary';
import { ApplicationError } from '../../../errors/application_error';
import { projectDeploymentOrchestrationContext } from '../../push_single_action_contexts';
import { DeploymentOrchestrationUseCase } from '../deployment_orchestration_use_case';
import type { DeploymentOrchestrationContext } from '../../../ports/deployment_orchestration_ports';
import type { DeploymentOrchestrationDependencies } from '../../../services/deployment_orchestration_dependencies';
import { buildInitialDeploymentOperation } from '../../../policies/deployment_plan_policy';
import { DEFAULT_DEPLOYMENT_CONFIGURATION } from '../../../../domain/deployment_configuration';
import { DEFAULT_COPILOT_LIFECYCLE_LABELS } from '../../../../domain/copilot_lifecycle';
import type { DeploymentOperationSnapshot } from '../../../../domain/deployment_operation';
import type { DeploymentCandidateReplacementEvidence } from '../../../../domain/deployment_candidate_replacement';
import { decideDeploymentStateSave, readDeploymentOperationState } from '../../../../domain/deployment_state_fence';

const oldSha = 'a'.repeat(40); const candidateSha = 'b'.repeat(40); const baseSha = 'c'.repeat(40);
const reviewedSha = 'e'.repeat(40); const oldId = 'operation-previous'; const newId = 'operation-successor';
const oldCandidate = (overrides: Partial<DeploymentOperationSnapshot> = {}): DeploymentOperationSnapshot => ({
  ...buildInitialDeploymentOperation({ operationId: oldId, locale: { repository: 'en-US', issue: 'en-US', pullRequest: 'en-US' },
    kind: 'release', version: '1.5.2', title: 'Release', changelog: 'Changes', sourceBranch: 'release/1.5.2',
    sourceSha: oldSha, originBranch: 'develop', originSha: 'd'.repeat(40), productionBranch: 'master', developmentBranch: 'develop',
    configuration: { ...DEFAULT_DEPLOYMENT_CONFIGURATION, reconciliationPullRequestMode: 'create-only' }, publicationWorkflow: 'release.yml',
  }), phase: 'promotion_pr_pending', revision: 3, prMode: 'create-only', promotionPullRequest: 173, ...overrides,
});
function input(current: DeploymentOperationSnapshot): DeploymentOrchestrationContext {
  return { owner: 'owner', repo: 'project', branches: { defaultBranch: 'master', development: 'develop', releaseTree: 'release', hotfixTree: 'hotfix' },
    workflows: { release: 'release.yml', hotfix: 'hotfix.yml' }, locale: current.locale,
    labels: { isRelease: true, isHotfix: false, deploy: 'deploy', deployed: 'deployed', lifecycle: DEFAULT_COPILOT_LIFECYCLE_LABELS },
    deployment: { ...DEFAULT_DEPLOYMENT_CONFIGURATION },
    singleAction: { issue: 170, version: '1.5.2', title: '', changelog: '', operationId: oldId, message: '',
      isReplaceDeploymentAction: true, isPrepareDeploymentAction: false, isContinueDeploymentAction: false,
      isPublishedDeploymentAction: false, isFailedDeploymentAction: false, replacementRevision: 3,
      candidateSha, reviewedSourceSha: reviewedSha, productionBaseSha: baseSha, confirmedUnpublished: true },
    pullRequest: { number: -1 }, currentConfiguration: { branchType: 'release', releaseBranch: current.sourceBranch,
      releaseOriginBranch: current.originBranch, releaseOriginSha: current.originSha, deploymentOrchestration: current },
  };
}
function nativeEvidence(): DeploymentCandidateReplacementEvidence {
  return { launcher: { open: true, operationId: oldId, revision: 3, kind: 'release', sourceBranch: 'release/1.5.2' }, sourceSha: candidateSha, productionSha: baseSha, oldSourceReachable: true, reviewedSourceReachable: true,
    oldSourceInProduction: false, closedPromotionHeadReachable: true, conflictingOpenPromotion: false, nativePublicationVacant: true,
    promotion: { number: 173, repositoryFullName: 'owner/project', operationId: oldId, issue: 170, phase: 'promotion',
      sourceBranch: 'release/1.5.2', headSha: reviewedSha, productionBranch: 'master', closed: true, merged: false, autoMergeEnabled: false, queued: false } };
}
function harness(initial = oldCandidate()) {
  let durable = initial;
  const created: Array<any> = [];
  const store = {
    load: jest.fn(async () => readDeploymentOperationState(durable)),
    save: jest.fn(async (command: any) => {
      const decision = decideDeploymentStateSave(readDeploymentOperationState(durable), command.expected, command.state.deploymentOrchestration);
      if (decision.kind !== 'write') return decision;
      durable = command.state.deploymentOrchestration;
      return { kind: 'saved' as const, operation: durable };
    }),
  };
  const dependencies: DeploymentOrchestrationDependencies = {
    state: { bind: jest.fn().mockReturnValue(store) }, labels: { getLabels: jest.fn().mockResolvedValue(['release']), setLabels: jest.fn() },
    operationId: jest.fn().mockReturnValue(newId),
    replacementInspection: { inspect: jest.fn().mockImplementation(async () => ({ ...nativeEvidence(), launcher: {
      ...nativeEvidence().launcher, operationId: durable.operationId, revision: durable.revision,
    } })) },
    git: { getBranchSha: jest.fn().mockImplementation(async branch => branch === 'master' ? baseSha : candidateSha),
      getMergeBaseSha: jest.fn(), isCommitReachable: jest.fn().mockResolvedValue(true),
      createOrVerifyBranch: jest.fn(), mergeCommitIntoBranch: jest.fn(), deleteBranch: jest.fn(), listBranches: jest.fn().mockResolvedValue([]) },
    pullRequests: {
      findManagedPullRequests: jest.fn().mockImplementation(async command => created.filter(pr => pr.body.includes(`operation-id="${command.operationId}"`))),
      createManagedPullRequest: jest.fn().mockImplementation(async command => {
        const pr = { number: 174, nodeId: 'PR174', body: command.body, headBranch: command.headBranch, headSha: candidateSha,
          baseBranch: command.baseBranch, state: 'open', merged: false, autoMergeEnabled: false, repositoryFullName: 'owner/project' };
        created.push(pr); return pr;
      }), getPullRequest: jest.fn(), prepareIssueCompletion: jest.fn(),
      enableAutoMerge: jest.fn(), isPullRequestQueued: jest.fn().mockResolvedValue(false),
      enqueuePullRequest: jest.fn(), mergePullRequest: jest.fn(),
    },
    targetRules: { getTargetCapabilities: jest.fn().mockResolvedValue({ autoMergeAllowed: false, mergeQueueRequired: false,
      immediatelyMergeable: false, requiresStrictStatusChecks: false, mergeQueueProducers: [], mergeQueueObservationProblems: [] }) },
    presentation: { findDashboard: jest.fn(), createDashboard: jest.fn(), updateDashboard: jest.fn(), publishMilestone: jest.fn() },
    publication: { inspect: jest.fn() }, continuation: { dispatch: jest.fn() }, issues: { reconcileCompletion: jest.fn().mockResolvedValue([new Result({ id: 'ReconcileClosedIssueMetadataUseCase', success: true, executed: false, payload: { issueCompletion: { nativeClosed: true, reconciled: true, outcome: 'already-converged' } } })]), closeIssue: jest.fn(), addComment: jest.fn() },
  };
  const useCase = new DeploymentOrchestrationUseCase(dependencies);
  return { dependencies, useCase, store, created, current: () => durable, setCurrent: (value: DeploymentOperationSnapshot) => { durable = value; } };
}
const mock = <T extends (...args: any[]) => any>(value: T) => value as jest.MockedFunction<T>;

it('replaces a corrected unpublished candidate only after fresh native authority, preserving version and origin', async () => {
  const previous = oldCandidate(); const value = harness(previous);
  const result = await value.useCase.invoke(input(previous));
  expect(result.every(item => item.success)).toBe(true);
  expect(value.current()).toMatchObject({ operationId: newId, sourceSha: candidateSha, version: previous.version,
    sourceBranch: previous.sourceBranch, originBranch: previous.originBranch, originSha: previous.originSha,
    phase: 'promotion_pr_pending', promotionPullRequest: 174,
    supersededCandidates: [{ operationId: oldId, revision: 3, sourceSha: oldSha, promotionPullRequest: 173,
      replacementSourceSha: reviewedSha, replacementBaseSha: baseSha }],
  });
  expect(value.store.save.mock.calls[0][0].expected).toEqual({ kind: 'replacement', fence: { operationId: oldId, phase: previous.phase, revision: 3 } });
  expect(value.dependencies.replacementInspection!.inspect).toHaveBeenCalledTimes(1);
  expect(value.dependencies.pullRequests.createManagedPullRequest).toHaveBeenCalledTimes(1);
  expect(value.dependencies.pullRequests.enableAutoMerge).not.toHaveBeenCalled();
  expect(value.dependencies.git.mergeCommitIntoBranch).not.toHaveBeenCalled(); expect(value.dependencies.git.deleteBranch).not.toHaveBeenCalled();
  expect(value.dependencies.continuation.dispatch).not.toHaveBeenCalled(); expect(value.dependencies.publication.inspect).not.toHaveBeenCalled();
  expect(previous.operationId).toBe(oldId); expect(previous.supersededCandidates).toBeUndefined();
});
it('recovers an exact persisted successor without allocating another operation or PR', async () => {
  const value = harness(); await value.useCase.invoke(input(oldCandidate())); const persisted = value.current();
  mock(value.dependencies.replacementInspection!.inspect).mockClear();
  const result = await value.useCase.invoke(input(persisted));
  expect(value.dependencies.replacementInspection!.inspect).toHaveBeenCalledTimes(1);
  expect(value.dependencies.replacementInspection!.inspect).toHaveBeenCalledWith(expect.objectContaining({ preparation: { kind: 'recorded', candidateSha } }));
  expect(result.every(item => item.success)).toBe(true); expect(value.current().operationId).toBe(newId);
  expect(value.dependencies.operationId).toHaveBeenCalledTimes(1);
  expect(value.dependencies.pullRequests.createManagedPullRequest).toHaveBeenCalledTimes(1);
});
it.each(['candidateSha', 'reviewedSourceSha', 'productionBaseSha'] as const)('never calls native inspection or mutates state for missing %s', async field => {
  const value = harness(); const context = input(oldCandidate()); (context.singleAction as any)[field] = '';
  const result = await value.useCase.invoke(context); expect(result[0].success).toBe(false);
  expect(value.store.save).not.toHaveBeenCalled(); expect(value.dependencies.replacementInspection!.inspect).not.toHaveBeenCalled();
  expect(value.dependencies.pullRequests.createManagedPullRequest).not.toHaveBeenCalled();
});
it.each([
  { confirmedUnpublished: false }, { replacementRevision: 4 }, { operationId: 'operation-foreign' },
  { version: '1.5.3' }, { title: 'Override' }, { changelog: 'Override' }, { isPrepareDeploymentAction: true },
  { isContinueDeploymentAction: true }, { isPublishedDeploymentAction: true }, { isFailedDeploymentAction: true },
])('rejects stale or ambiguous explicit requests before any native work: %p', async patch => {
  const value = harness(); const context = input(oldCandidate()); Object.assign(context.singleAction, patch);
  const result = await value.useCase.invoke(context); expect(result[0].success).toBe(false);
  expect(value.store.save).not.toHaveBeenCalled(); expect(value.dependencies.replacementInspection!.inspect).not.toHaveBeenCalled();
});
it('fails closed without the new read capability and preserves the previous operation', async () => {
  const value = harness(); (value.dependencies as any).replacementInspection = undefined;
  const result = await value.useCase.invoke(input(oldCandidate())); expect(result[0].success).toBe(false);
  expect(value.store.save).not.toHaveBeenCalled(); expect(value.current().operationId).toBe(oldId);
});
it('rejects absence of a previous operation or its native promotion identity', async () => {
  for (const missingState of [true, false]) {
    const previous = oldCandidate({ promotionPullRequest: undefined }); const value = harness(previous);
    if (missingState) value.store.load.mockResolvedValueOnce({ kind: 'absent' } as never);
    const result = await value.useCase.invoke(input(previous)); expect(result[0].success).toBe(false);
    expect(value.store.save).not.toHaveBeenCalled(); expect(value.dependencies.pullRequests.createManagedPullRequest).not.toHaveBeenCalled();
  }
});
it.each(['sourceSha', 'productionSha', 'nativePublicationVacant', 'conflictingOpenPromotion'] as const)('revalidates %s immediately before replacement persistence', async field => {
  const value = harness(); const facts = nativeEvidence(); const changed = { ...facts, [field]:
    field === 'nativePublicationVacant' ? false : field === 'conflictingOpenPromotion' ? true : 'f'.repeat(40) };
  mock(value.dependencies.replacementInspection!.inspect).mockResolvedValueOnce(changed);
  const result = await value.useCase.invoke(input(oldCandidate())); expect(result[0].success).toBe(false);
  expect(value.store.save).not.toHaveBeenCalled(); expect(value.dependencies.operationId).not.toHaveBeenCalled();
});
it.each(['fresh', 'recorded'])('retains durable state when the %s native inspection is unknown', async when => {
  const value = harness();
  if (when === 'recorded') await value.useCase.invoke(input(oldCandidate()));
  const current = value.current(); value.store.save.mockClear(); mock(value.dependencies.presentation.createDashboard).mockClear();
  const inspect = mock(value.dependencies.replacementInspection!.inspect); inspect.mockClear();
  inspect.mockRejectedValueOnce(new Error('PRIVATE_PROVIDER_DETAIL'));
  const result = await value.useCase.invoke(input(current)); expect(result[0].success).toBe(false);
  expect(inspect).toHaveBeenCalledTimes(1); expect(value.store.save).not.toHaveBeenCalled(); expect(value.current().operationId).toBe(current.operationId);
  expect(value.dependencies.presentation.createDashboard).not.toHaveBeenCalled();
});
it('leaves a concurrent replacement owner intact when the native revision fence changes', async () => {
  const value = harness(); const winner = oldCandidate({ operationId: 'operation-other-owner', revision: 4 });
  value.store.save.mockImplementationOnce(async () => ({ kind: 'conflict', operation: winner } as never));
  const context = input(oldCandidate()); const result = await value.useCase.invoke(context);
  expect(result[0].success).toBe(true); expect(context.currentConfiguration.deploymentOrchestration).toEqual(winner);
  expect(value.dependencies.pullRequests.createManagedPullRequest).not.toHaveBeenCalled();
});
it('recovers a persisted successor after its save response is lost without marking or overwriting the old candidate', async () => {
  const value = harness();
  value.store.save.mockImplementationOnce(async command => {
    value.setCurrent(command.state.deploymentOrchestration); throw new Error('PRIVATE_SAVE_RESPONSE');
  });
  const context = input(oldCandidate()); const first = await value.useCase.invoke(context);
  expect(first[0].success).toBe(false); expect(value.current().operationId).toBe(newId);
  expect(context.currentConfiguration.deploymentOrchestration!.operationId).toBe(oldId);
  expect(JSON.stringify(first)).not.toContain('PRIVATE_SAVE_RESPONSE');
  expect(value.dependencies.pullRequests.createManagedPullRequest).not.toHaveBeenCalled();
  const second = await value.useCase.invoke(input(value.current())); expect(second.every(item => item.success)).toBe(true);
  expect(value.dependencies.operationId).toHaveBeenCalledTimes(1); expect(value.created).toHaveLength(1);
});
it('recovers a PR created before its response is lost under the successor marker', async () => {
  const value = harness(); const create = mock(value.dependencies.pullRequests.createManagedPullRequest); const normal = create.getMockImplementation()!;
  create.mockImplementationOnce(async command => { await normal(command); throw new Error('PR response lost'); });
  const first = await value.useCase.invoke(input(oldCandidate())); expect(first[0].success).toBe(false);
  const second = await value.useCase.invoke(input(value.current())); expect(second.every(item => item.success)).toBe(true);
  expect(value.created).toHaveLength(1); expect(value.dependencies.operationId).toHaveBeenCalledTimes(1);
});
it.each(['continue', 'published', 'failed'] as const)('rejects every old %s callback before it can mutate the successor', async callback => {
  const value = harness(); await value.useCase.invoke(input(oldCandidate())); const current = value.current();
  const before = JSON.stringify(current); const context = input(current); Object.assign(context.singleAction, {
    isReplaceDeploymentAction: false, isContinueDeploymentAction: callback === 'continue',
    isPublishedDeploymentAction: callback === 'published', isFailedDeploymentAction: callback === 'failed',
  });
  value.store.save.mockClear(); mock(value.dependencies.continuation.dispatch).mockClear();
  const result = await value.useCase.invoke(context); expect(result[0].success).toBe(false);
  expect(value.store.save).not.toHaveBeenCalled(); expect(JSON.stringify(value.current())).toBe(before);
  expect(value.dependencies.continuation.dispatch).not.toHaveBeenCalled();
});
it('does not turn ordinary prepare into an implicit source replacement', async () => {
  const value = harness(); const context = input(oldCandidate()); Object.assign(context.singleAction, { isReplaceDeploymentAction: false, isPrepareDeploymentAction: true });
  const result = await value.useCase.invoke(context); expect(result[0].success).toBe(false);
  expect(value.current().operationId).toBe(oldId); expect(value.dependencies.operationId).not.toHaveBeenCalled();
});


it('projects replacement proofs and predecessor inventory as independent immutable data', async () => {
  const value = harness(); await value.useCase.invoke(input(oldCandidate())); const original = input(value.current());
  const projected = projectDeploymentOrchestrationContext(original);
  expect(projected.singleAction).toMatchObject({ isReplaceDeploymentAction: true, replacementRevision: 3,
    reviewedSourceSha: reviewedSha, candidateSha, productionBaseSha: baseSha, confirmedUnpublished: true });
  expect(Object.isFrozen(projected.singleAction)).toBe(true);
  expect(Object.isFrozen(projected.currentConfiguration.deploymentOrchestration!.supersededCandidates)).toBe(true);
  expect(Object.isFrozen(projected.currentConfiguration.deploymentOrchestration!.supersededCandidates![0])).toBe(true);
  (original.currentConfiguration.deploymentOrchestration!.supersededCandidates![0] as any).sourceSha = 'f'.repeat(40);
  expect(projected.currentConfiguration.deploymentOrchestration!.supersededCandidates![0].sourceSha).toBe(oldSha);
});


it('does not repeat any preparation/promotion effect for an accepted recorded successor', async () => {
  const value = harness(); await value.useCase.invoke(input(oldCandidate()));
  value.setCurrent({ ...value.current(), phase: 'promoted', productionSha: baseSha });
  value.store.save.mockClear(); mock(value.dependencies.replacementInspection!.inspect).mockClear();
  mock(value.dependencies.presentation.createDashboard).mockClear(); mock(value.dependencies.pullRequests.findManagedPullRequests).mockClear();
  const result = await value.useCase.invoke(input(value.current())); expect(result[0].success).toBe(true);
  expect(value.store.save).not.toHaveBeenCalled(); expect(value.dependencies.replacementInspection!.inspect).not.toHaveBeenCalled();
  expect(value.dependencies.presentation.createDashboard).not.toHaveBeenCalled(); expect(value.dependencies.pullRequests.findManagedPullRequests).not.toHaveBeenCalled();
});
it.each(['sourceSha', 'productionSha', 'nativePublicationVacant', 'conflictingOpenPromotion'] as const)(
  'never recovers a pending successor after its native %s authority changes', async field => {
    const value = harness(); await value.useCase.invoke(input(oldCandidate())); value.store.save.mockClear();
    const current = value.current(); const facts = { ...nativeEvidence(), launcher: { ...nativeEvidence().launcher,
      operationId: current.operationId, revision: current.revision }, [field]: field === 'nativePublicationVacant'
        ? false : field === 'conflictingOpenPromotion' ? true : '9'.repeat(40) };
    mock(value.dependencies.replacementInspection!.inspect).mockResolvedValueOnce(facts);
    const result = await value.useCase.invoke(input(current)); expect(result[0].success).toBe(false);
    expect(value.store.save).not.toHaveBeenCalled(); expect(value.current().operationId).toBe(newId);
  });

it.each(['replacementRevision', 'candidateSha', 'reviewedSourceSha', 'productionBaseSha'] as const)('rejects absent optional proof %s without native queries', async field => {
  const value = harness(); const context = input(oldCandidate()); (context.singleAction as any)[field] = undefined;
  expect((await value.useCase.invoke(context))[0].success).toBe(false); expect(value.store.save).not.toHaveBeenCalled(); expect(value.dependencies.replacementInspection!.inspect).not.toHaveBeenCalled();
});
it('preserves a classified uncertain persistence failure without rewriting native state', async () => {
  const value = harness(); value.store.save.mockRejectedValueOnce(new ApplicationError('provider.unavailable', 'Save response unavailable'));
  expect((await value.useCase.invoke(input(oldCandidate())))[0].success).toBe(false); expect(value.current().operationId).toBe(oldId); expect(value.dependencies.pullRequests.createManagedPullRequest).not.toHaveBeenCalled();
});
it('rejects missing configured source ownership without accepting a bare native branch', async () => {
  const value = harness(); const context = input(oldCandidate()); context.currentConfiguration.releaseBranch = undefined;
  expect((await value.useCase.invoke(context))[0].success).toBe(false); expect(value.store.save).not.toHaveBeenCalled();
});
it('uses the same fresh replacement proof and preserved origin for a hotfix', async () => {
  const previous = oldCandidate({ kind: 'hotfix', sourceBranch: 'hotfix/1.5.2', originBranch: 'master', publicationWorkflow: 'hotfix.yml' });
  const value = harness(previous); const context = input(previous);
  Object.assign(context.labels, { isRelease: false, isHotfix: true });
  Object.assign(context.currentConfiguration, { branchType: 'hotfix', hotfixBranch: previous.sourceBranch, hotfixOriginBranch: previous.originBranch, hotfixOriginSha: previous.originSha });
  mock(value.dependencies.labels.getLabels).mockResolvedValue(['hotfix']);
  const facts = nativeEvidence(); mock(value.dependencies.replacementInspection!.inspect).mockImplementation(async () => ({ ...facts, launcher: { ...facts.launcher, kind: 'hotfix', sourceBranch: previous.sourceBranch, operationId: value.current().operationId, revision: value.current().revision }, promotion: { ...facts.promotion, sourceBranch: previous.sourceBranch } }));
  expect((await value.useCase.invoke(context)).every(item => item.success)).toBe(true); expect(value.current()).toMatchObject({ kind: 'hotfix', originBranch: 'master', originSha: previous.originSha });
  expect(value.dependencies.replacementInspection!.inspect).toHaveBeenCalledWith(expect.objectContaining({ preparation: { kind: 'fresh', candidateSha } }));
});

it('updates the existing predecessor dashboard instead of creating a duplicate audit card', async () => {
  const value = harness(); mock(value.dependencies.presentation.findDashboard).mockImplementation(async (_issue, marker) => marker.includes(oldId) ? { id: 99, body: 'Previous dashboard' } : undefined);
  expect((await value.useCase.invoke(input(oldCandidate()))).every(result => result.success)).toBe(true);
  expect(value.dependencies.presentation.updateDashboard).toHaveBeenCalledWith(170, 99, expect.stringContaining('superseded'));
  expect(mock(value.dependencies.presentation.createDashboard).mock.calls.every(([, body]) => !body.includes(`operation-id="${oldId}"`))).toBe(true);
});
it('retains the missing-provenance guard before any historical dashboard write', async () => {
  const value = harness(); const runtime = new DeploymentOrchestrationRuntime(value.dependencies, new DeploymentStateBoundary(value.dependencies.state, value.dependencies.labels));
  await expect(runtime.publishSupersededCandidate(input(oldCandidate()), oldCandidate())).rejects.toMatchObject({ code: 'workflow.invalid-event' });
  expect(value.dependencies.presentation.findDashboard).not.toHaveBeenCalled(); expect(value.dependencies.presentation.createDashboard).not.toHaveBeenCalled(); expect(value.store.save).not.toHaveBeenCalled();
});
