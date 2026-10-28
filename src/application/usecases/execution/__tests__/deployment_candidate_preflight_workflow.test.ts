import { DeploymentCandidatePreflightWorkflow, type DeploymentCandidatePreflightInput } from '../deployment_candidate_preflight_workflow';
import { buildInitialDeploymentOperation } from '../../../policies/deployment_plan_policy';
import type { DeploymentCandidateLauncher, DeploymentCandidateWorkflowRun } from '../../../ports/deployment_candidate_inspection_ports';
import { DEFAULT_DEPLOYMENT_CONFIGURATION } from '../../../../domain/deployment_configuration';
import { buildReplacementDeploymentCandidate, type DeploymentCandidateReplacementEvidence } from '../../../../domain/deployment_candidate_replacement';

type Mutable<T> = { -readonly [K in keyof T]: T[K] };

const oldSha = 'a'.repeat(40); const reviewedSha = 'b'.repeat(40); const finalSha = 'f'.repeat(40); const baseSha = 'c'.repeat(40);
const intent = (): DeploymentCandidatePreflightInput => ({ operationId: 'operation-previous', expectedRevision: 3, version: '1.5.2',
  reviewedSourceSha: reviewedSha, confirmedUnpublished: true, issue: 170, repositoryFullName: 'owner/project', eventName: 'workflow_dispatch',
  eventMode: 'replace', runId: 50, runAttempt: 1, headBranch: 'release/1.5.2', headSha: reviewedSha,
  workflowProfile: '', releaseLabel: 'release', hotfixLabel: 'hotfix' });
function harness() {
  const launcher: Mutable<DeploymentCandidateLauncher> = { issue: 170, open: true, kind: 'release', sourceBranch: 'release/1.5.2',
    operation: { ...buildInitialDeploymentOperation({ operationId: 'operation-previous',
      locale: { repository: 'en-US', issue: 'en-US', pullRequest: 'en-US' }, kind: 'release', version: '1.5.2',
      title: 'Release', changelog: 'Changes', sourceBranch: 'release/1.5.2', sourceSha: oldSha, originBranch: 'develop', originSha: 'd'.repeat(40),
      productionBranch: 'master', developmentBranch: 'develop', configuration: DEFAULT_DEPLOYMENT_CONFIGURATION, publicationWorkflow: 'release.yml',
    }), phase: 'promotion_pr_pending', revision: 3, promotionPullRequest: 173 },
    admission: { labels: ['release'], body: '### Release Type\n\nPatch\n\n### Release Version\n\n1.5.2\n\n### Changelog\n\nChanges\n\n### Additional Context\n\nNone' },
  };
  const run: Mutable<DeploymentCandidateWorkflowRun> = { id: 50, attempt: 1, repositoryFullName: 'owner/project', headRepositoryFullName: 'owner/project',
    headBranch: launcher.sourceBranch, headSha: reviewedSha, event: 'workflow_dispatch', path: '.github/workflows/release.yml', status: 'in_progress' };
  const facts: Mutable<DeploymentCandidateReplacementEvidence> = { launcher: { open: true, operationId: launcher.operation.operationId, revision: 3,
    kind: 'release', sourceBranch: launcher.sourceBranch }, sourceSha: reviewedSha, productionSha: baseSha,
    oldSourceReachable: true, reviewedSourceReachable: true, oldSourceInProduction: false, closedPromotionHeadReachable: true,
    conflictingOpenPromotion: false, nativePublicationVacant: true, promotion: { number: 173, repositoryFullName: 'owner/project',
      operationId: 'operation-previous', issue: 170, phase: 'promotion', sourceBranch: launcher.sourceBranch,
      headSha: reviewedSha, productionBranch: 'master', closed: true, merged: false, autoMergeEnabled: false, queued: false } };
  const ports = { readLauncher: jest.fn().mockResolvedValue(launcher), readWorkflowRun: jest.fn().mockResolvedValue(run), inspect: jest.fn().mockResolvedValue(facts) };
  const workflow = new DeploymentCandidatePreflightWorkflow(ports);
  return { launcher, run, facts, ports, workflow };
}
it('proves fresh replacement intent without a single mutation, agent or workspace capability', async () => {
  const value = harness(); const result = await value.workflow.invoke(intent());
  expect(result).toEqual({ mode: 'prepare', issue: 170, version: '1.5.2', previousPromotion: 173, sourceBranch: 'release/1.5.2', candidateSha: reviewedSha,
    reviewedSourceSha: reviewedSha, productionBaseSha: baseSha, operationId: 'operation-previous', expectedRevision: 3,
    currentOperationId: 'operation-previous', currentRevision: 3 });
  expect(Object.isFrozen(result)).toBe(true); expect(Object.keys(value.ports).sort()).toEqual(['inspect', 'readLauncher', 'readWorkflowRun']);
  expect(JSON.stringify(result)).not.toContain('Changes'); expect(value.ports.inspect).toHaveBeenCalledTimes(1);
});
it.each([
  { issue: 0 }, { issue: NaN }, { runId: 0 }, { runAttempt: 0 }, { operationId: '' }, { expectedRevision: 0 },
  { expectedRevision: Number.MAX_SAFE_INTEGER }, { reviewedSourceSha: '' }, { version: 'next' }, { version: '9'.repeat(65) + '.0.0' },
  { confirmedUnpublished: false }, { eventName: 'issues' }, { eventMode: 'prepare' }, { repositoryFullName: 'https://attacker/repo' },
  { headSha: 'short' }, { workflowProfile: '{' }, { workflowProfile: '{"schemaVersion":99,"enabled":["release"]}' },
  { releaseLabel: '' }, { hotfixLabel: 'bad\nlabel' }, { releaseLabel: 'x'.repeat(257) },
])('rejects invalid explicit intent before native reads: %p', async patch => {
  const value = harness(); await expect(value.workflow.invoke({ ...intent(), ...patch })).rejects.toMatchObject({ code: 'workflow.stale' });
  expect(value.ports.readLauncher).not.toHaveBeenCalled(); expect(value.ports.readWorkflowRun).not.toHaveBeenCalled(); expect(value.ports.inspect).not.toHaveBeenCalled();
});
it.each([
  { id: 51 }, { attempt: 2 }, { repositoryFullName: 'foreign/project' }, { headRepositoryFullName: 'attacker/fork' },
  { event: 'push' }, { status: 'completed' }, { headSha: finalSha }, { headBranch: 'release/other' },
  { path: '.github/workflows/other.yml' },
])('rejects every independent native workflow identity mismatch: %p', async patch => {
  const value = harness(); Object.assign(value.run, patch);
  await expect(value.workflow.invoke(intent())).rejects.toMatchObject({ code: 'workflow.stale' });
  expect(value.ports.inspect).not.toHaveBeenCalled();
});
it('requires the exact launcher and current managed branch and accepts an explicit workflow path snapshot', async () => {
  const value = harness(); value.launcher.operation = { ...value.launcher.operation, publicationWorkflow: '.github/workflows/release.yml' };
  expect((await value.workflow.invoke(intent())).mode).toBe('prepare');
  await expect(value.workflow.invoke({ ...intent(), headBranch: 'another' })).rejects.toThrow('native-workflow-mismatch');
  (value.launcher as any).issue = 171;
  await expect(value.workflow.invoke(intent())).rejects.toThrow('native-workflow-mismatch');
});
it.each([
  { open: false }, { admission: { labels: ['feature'], body: '' } },
  { admission: { labels: ['release', 'hotfix'], body: '' } }, { admission: { labels: ['release'], body: '' } },
])('does not allocate project preparation for unadmitted work: %p', async patch => {
  const value = harness(); Object.assign(value.launcher, patch);
  await expect(value.workflow.invoke(intent())).rejects.toThrow('launcher-not-admitted'); expect(value.ports.inspect).not.toHaveBeenCalled();
});
it('preserves schema2 field mappings, configured kind aliases and disabled-profile behavior', async () => {
  const value = harness(); const profile = JSON.stringify({ schemaVersion: 2, enabled: ['release'], fieldMappings: { release: { 'Release Version': 'Project Version' } } });
  (value.launcher.admission as any).body = value.launcher.admission.body.replace('Release Version', 'Project Version');
  (value.launcher.admission as any).labels = ['ship'];
  expect((await value.workflow.invoke({ ...intent(), workflowProfile: profile, releaseLabel: 'ship' })).mode).toBe('prepare');
  await expect(value.workflow.invoke({ ...intent(), workflowProfile: '{"schemaVersion":1,"enabled":["bugfix"]}' })).rejects.toThrow('launcher-not-admitted');
});
it.each([{ operationId: 'operation-other' }, { expectedRevision: 4 }, { version: '1.5.3' }])('rejects stale candidate identity before inventory reads: %p', async patch => {
  const value = harness(); await expect(value.workflow.invoke({ ...intent(), ...patch })).rejects.toThrow('stale-candidate-intent');
  expect(value.ports.inspect).not.toHaveBeenCalled();
});
it('refuses a preparation state without a previous native promotion', async () => {
  const value = harness(); value.launcher.operation = { ...value.launcher.operation, promotionPullRequest: undefined };
  await expect(value.workflow.invoke(intent())).rejects.toThrow('missing-previous-promotion'); expect(value.ports.inspect).not.toHaveBeenCalled();
});
it.each([
  { sourceSha: finalSha }, { nativePublicationVacant: false }, { conflictingOpenPromotion: true },
  { oldSourceReachable: false }, { reviewedSourceReachable: false }, { oldSourceInProduction: true },
])('blocks changed or unsafe native facts before emitting candidate outputs: %p', async patch => {
  const value = harness(); Object.assign(value.facts, patch);
  await expect(value.workflow.invoke(intent())).rejects.toMatchObject({ code: 'workflow.stale' });
});
it('does not silently replace an unchanged source', async () => {
  const value = harness(); (value.launcher.operation as any).sourceSha = reviewedSha;
  await expect(value.workflow.invoke(intent())).rejects.toThrow('unchanged-source');
});
it('recovers only the recorded validated successor while keeping the original reviewed source and base', async () => {
  const value = harness(); const next = buildReplacementDeploymentCandidate(value.launcher.operation, {
    ...intent(), candidateSha: finalSha, productionBaseSha: baseSha,
  }, 'operation-successor');
  value.launcher.operation = next; value.facts.sourceSha = finalSha;
  value.facts.launcher = { ...value.facts.launcher, operationId: next.operationId, revision: next.revision };
  value.run.headSha = finalSha;
  const result = await value.workflow.invoke({ ...intent(), headSha: finalSha });
  expect(result).toMatchObject({ mode: 'recover', candidateSha: finalSha, reviewedSourceSha: reviewedSha, currentOperationId: next.operationId });
  expect(value.ports.inspect.mock.calls[0][0].allowedCurrentPromotion).toMatchObject({ operationId: next.operationId, sourceSha: finalSha });
});
it('reports an already accepted successor without source or publication reads or mutation', async () => {
  const value = harness(); const next = buildReplacementDeploymentCandidate(value.launcher.operation, {
    ...intent(), candidateSha: finalSha, productionBaseSha: baseSha,
  }, 'operation-successor');
  value.launcher.operation = { ...next, phase: 'promoted', productionSha: baseSha };
  (value.launcher as any).open = false;
  const result = await value.workflow.invoke(intent()); expect(result.mode).toBe('recorded');
  expect(value.ports.inspect).not.toHaveBeenCalled();
});
it('does not turn a recorded successor into a new replacement when request provenance differs', async () => {
  const value = harness(); value.launcher.operation = buildReplacementDeploymentCandidate(value.launcher.operation, {
    ...intent(), candidateSha: finalSha, productionBaseSha: baseSha,
  }, 'operation-successor');
  const other = '9'.repeat(40); value.run.headSha = other;
  await expect(value.workflow.invoke({ ...intent(), headSha: other, reviewedSourceSha: other })).rejects.toThrow('stale-candidate-intent');
});
it.each(['readLauncher', 'readWorkflowRun', 'inspect'] as const)('preserves unknown %s failures instead of inventing outputs', async method => {
  const value = harness(); value.ports[method].mockRejectedValueOnce(new Error('Native read unavailable'));
  await expect(value.workflow.invoke(intent())).rejects.toThrow('Native read unavailable');
});

it('rejects a dispatch from another full SHA even when the candidate intent is otherwise valid', async () => {
  const value = harness(); value.run.headSha = finalSha;
  await expect(value.workflow.invoke({ ...intent(), headSha: finalSha })).rejects.toThrow('native-workflow-mismatch');
  expect(value.ports.inspect).not.toHaveBeenCalled();
});

it('retains the final missing-promotion guard for a corrupted terminal recovery snapshot', async () => {
  const value = harness(); const next = buildReplacementDeploymentCandidate(value.launcher.operation, { ...intent(), candidateSha: finalSha, productionBaseSha: baseSha }, 'operation-successor');
  value.launcher.operation = { ...next, phase: 'promoted', productionSha: baseSha, supersededCandidates: [{ ...next.supersededCandidates![0], promotionPullRequest: undefined as never }] };
  await expect(value.workflow.invoke(intent())).rejects.toThrow('missing-previous-promotion'); expect(value.ports.inspect).not.toHaveBeenCalled();
});
