import { decideDeploymentStateSave, deploymentStateFence, readDeploymentOperationState } from '../deployment_state_fence';
import {
  isDeploymentOperationSnapshot,
  MAX_SUPERSEDED_DEPLOYMENT_CANDIDATES,
  type DeploymentOperationSnapshot,
} from '../deployment_operation';
import {
  assessDeploymentCandidateReplacement,
  assessRecordedCandidateReplacementRecovery,
  assessDeploymentCandidateReplacementState,
  buildReplacementDeploymentCandidate,
  isRecordedCandidateReplacement,
  validateDeploymentCandidateReplacementRequest,
  type DeploymentCandidateReplacementContext,
  type DeploymentCandidateReplacementEvidence,
  type DeploymentCandidateReplacementRequest,
} from '../deployment_candidate_replacement';

const oldSha = 'a'.repeat(40);
const candidateSha = 'b'.repeat(40);
const productionSha = 'c'.repeat(40);
const initial = (changes: Partial<DeploymentOperationSnapshot> = {}): DeploymentOperationSnapshot => ({
  stateVersion: 1, revision: 3, operationId: 'operation-previous',
  locale: { repository: 'en-US', issue: 'en-US', pullRequest: 'en-US' },
  kind: 'release', version: '1.5.2', title: 'Candidate', changelog: 'Changes', phase: 'promotion_pr_pending',
  strategy: 'production-lineage', prMode: 'auto', selectedPrMode: 'create-only', backmergeMode: 'auto',
  hotfixActiveReleasePolicy: 'prefer-release', cleanup: 'all', issueCompletion: 'close', presentationMode: 'guided',
  diagrams: true, commentMode: 'update', sourceBranch: 'release/1.5.2', sourceSha: oldSha,
  originBranch: 'develop', originSha: 'd'.repeat(40), productionBranch: 'master', developmentBranch: 'develop',
  reconciliationTree: 'sync', promotionPullRequest: 173, tag: 'v1.5.2', publicationWorkflow: 'release.yml',
  publicationVerified: false, reconciliationTargets: [], lastFailure: null, ...changes,
});
const request = (changes: Partial<DeploymentCandidateReplacementRequest> = {}): DeploymentCandidateReplacementRequest => ({
  operationId: 'operation-previous', expectedRevision: 3, version: '1.5.2', candidateSha, reviewedSourceSha: candidateSha,
  productionBaseSha: productionSha, confirmedUnpublished: true, ...changes,
});
const context = (changes: Partial<DeploymentCandidateReplacementContext> = {}): DeploymentCandidateReplacementContext => ({
  repositoryFullName: 'owner/project', issue: 170, kind: 'release', sourceBranch: 'release/1.5.2',
  productionBranch: 'master', ...changes,
});
const evidence = (changes: Partial<DeploymentCandidateReplacementEvidence> = {}): DeploymentCandidateReplacementEvidence => ({
  launcher: { open: true, operationId: 'operation-previous', revision: 3, kind: 'release', sourceBranch: 'release/1.5.2' },
  sourceSha: candidateSha, productionSha, oldSourceReachable: true, reviewedSourceReachable: true, oldSourceInProduction: false,
  closedPromotionHeadReachable: true, conflictingOpenPromotion: false, nativePublicationVacant: true,
  promotion: { number: 173, repositoryFullName: 'owner/project', operationId: 'operation-previous', issue: 170,
    phase: 'promotion', sourceBranch: 'release/1.5.2', headSha: oldSha, productionBranch: 'master',
    closed: true, merged: false, autoMergeEnabled: false, queued: false }, ...changes,
});

it('admits a fresh validated release source while retaining all frozen version and origin facts', () => {
  expect(assessDeploymentCandidateReplacement(initial(), request(), context(), evidence())).toEqual({ kind: 'allowed' });
  const previous = initial(); const next = buildReplacementDeploymentCandidate(previous, request(), 'operation-successor');
  expect(next).toMatchObject({ operationId: 'operation-successor', revision: 4, sourceSha: candidateSha, phase: 'preparing',
    version: previous.version, title: previous.title, changelog: previous.changelog,
    locale: previous.locale, sourceBranch: previous.sourceBranch, originBranch: previous.originBranch,
    originSha: previous.originSha, productionBranch: previous.productionBranch, prMode: previous.prMode,
    supersededCandidates: [{ operationId: previous.operationId, revision: 3, sourceSha: oldSha, promotionPullRequest: 173, replacementSourceSha: candidateSha, replacementBaseSha: productionSha }],
  });
  expect(next.promotionPullRequest).toBeUndefined(); expect(next.selectedPrMode).toBeUndefined();
  expect(next.productionSha).toBeUndefined(); expect(next.publicationReceipt).toBeUndefined();
  expect(next.publicationVerified).toBe(false); expect(next.reconciliationTargets).toEqual([]); expect(next.lastFailure).toBeNull();
  expect(isDeploymentOperationSnapshot(next)).toBe(true); expect(previous.supersededCandidates).toBeUndefined();
});
it('keeps a hotfix production-tag origin and snapshotted Spanish policy', () => {
  const current = initial({ kind: 'hotfix', sourceBranch: 'hotfix/1.5.2', originBranch: 'master',
    locale: { repository: 'es-ES', issue: 'es-ES', pullRequest: 'es-ES' } });
  const facts = evidence(); const native = { ...facts, launcher: { ...facts.launcher, kind: current.kind, sourceBranch: current.sourceBranch }, promotion: { ...facts.promotion, sourceBranch: current.sourceBranch } };
  expect(assessDeploymentCandidateReplacement(current, request(), context({ kind: 'hotfix', sourceBranch: current.sourceBranch }), native)).toEqual({ kind: 'allowed' });
  expect(buildReplacementDeploymentCandidate(current, request(), 'operation-successor').originSha).toBe(current.originSha);
});
it.each([
  { operationId: '' }, { operationId: '../unsafe' }, { operationId: undefined },
  { expectedRevision: 0 }, { expectedRevision: -1 }, { expectedRevision: 1.5 }, { expectedRevision: NaN },
  { expectedRevision: Number.MAX_SAFE_INTEGER }, { expectedRevision: Number.MAX_SAFE_INTEGER + 1 },
  { version: '1.5' }, { version: undefined }, { version: '1.5.2\n' },
  { candidateSha: '' }, { candidateSha: 'A'.repeat(40) }, { candidateSha: 'b'.repeat(39) },
  { candidateSha: undefined }, { reviewedSourceSha: undefined }, { reviewedSourceSha: 'b'.repeat(39) }, { productionBaseSha: 'c'.repeat(64) }, { productionBaseSha: 'c'.repeat(40) + '\n' },
] as const)('rejects each invalid bounded request before native work: %p', patch => {
  expect(validateDeploymentCandidateReplacementRequest(request(patch as never))).toBe('invalid-request');
});
it.each([false, undefined, 'true', 1])('requires real explicit unpublished confirmation: %p', value => {
  expect(validateDeploymentCandidateReplacementRequest(request({ confirmedUnpublished: value as boolean }))).toBe('unconfirmed-publication-vacancy');
});
it.each([
  [{ operationId: 'operation-other' }, 'stale-operation'], [{ revision: 4 }, 'stale-revision'],
  [{ version: '1.5.3' }, 'different-version'], [{ phase: 'promoted' }, 'ineligible-phase'],
  [{ phase: 'publishing' }, 'ineligible-phase'], [{ phase: 'published' }, 'ineligible-phase'],
  [{ phase: 'reconciliation_pending' }, 'ineligible-phase'], [{ phase: 'completed' }, 'ineligible-phase'],
  [{ productionSha }, 'publication-effects'], [{ publicationVerified: true }, 'publication-effects'],
  [{ publicationReceipt: { tag: 'v1.5.2', productionSha, operationId: 'operation-previous', releaseUrl: 'https://example.test/release' } }, 'publication-effects'],
  [{ reconciliationTargets: [{ targetBranch: 'develop', sourceBranch: 'master', sourceSha: productionSha, status: 'pending' }] }, 'publication-effects'],
  [{ sourceSha: candidateSha }, 'unchanged-source'],
] as const)('refuses independent stale/irreversible state: %p', (patch, reason) => {
  expect(assessDeploymentCandidateReplacementState(initial(patch as never), request())).toBe(reason);
});
it('admits preparing and explicit nonretryable source-change blocks only from preacceptance', () => {
  expect(assessDeploymentCandidateReplacementState(initial({ phase: 'preparing' }), request())).toBeUndefined();
  for (const previousPhase of ['preparing', 'promotion_pr_pending'] as const) {
    expect(assessDeploymentCandidateReplacementState(initial({ phase: 'blocked', lastFailure: {
      category: 'promotion', message: 'Source changed', retryable: false, previousPhase,
    } }), request())).toBeUndefined();
  }
});
it.each([
  { category: 'publication', previousPhase: 'preparing' }, { category: 'promotion', previousPhase: 'promoted' },
  { category: 'cleanup', previousPhase: 'completed' },
] as const)('retains unrelated or postacceptance blocks: %p', failure => {
  expect(assessDeploymentCandidateReplacementState(initial({ phase: 'blocked', lastFailure: {
    ...failure, message: 'Do not replace', retryable: true,
  } }), request())).toBe('ineligible-phase');
});
it.each([
  { kind: 'hotfix' }, { sourceBranch: 'release/other' }, { productionBranch: 'production' },
] as const)('rejects changed launcher ownership: %p', patch => {
  expect(assessDeploymentCandidateReplacement(initial(), request(), context(patch), evidence())).toEqual({ kind: 'blocked', reason: 'changed-ownership' });
});
it.each([
  [{ sourceSha: oldSha }, 'changed-source'], [{ productionSha: oldSha }, 'changed-production-base'],
  [{ oldSourceReachable: false }, 'changed-lineage'], [{ reviewedSourceReachable: false }, 'changed-lineage'], [{ oldSourceInProduction: true }, 'changed-lineage'],
  [{ closedPromotionHeadReachable: false }, 'changed-lineage'], [{ conflictingOpenPromotion: true }, 'active-promotion'],
  [{ nativePublicationVacant: false }, 'native-publication-effects'],
] as const)('blocks changed native facts independently: %p', (patch, reason) => {
  expect(assessDeploymentCandidateReplacement(initial(), request(), context(), evidence(patch))).toEqual({ kind: 'blocked', reason });
});
it.each([
  [{ number: 174 }, 'invalid-promotion'], [{ operationId: 'operation-other' }, 'invalid-promotion'],
  [{ issue: 171 }, 'invalid-promotion'], [{ phase: 'reconciliation' }, 'invalid-promotion'],
  [{ repositoryFullName: 'attacker/fork' }, 'invalid-promotion'], [{ sourceBranch: 'other' }, 'invalid-promotion'],
  [{ productionBranch: 'other' }, 'invalid-promotion'], [{ headSha: 'x' }, 'invalid-promotion'],
  [{ closed: false }, 'active-promotion'], [{ merged: true }, 'active-promotion'],
  [{ autoMergeEnabled: true }, 'active-promotion'], [{ queued: true }, 'active-promotion'],
] as const)('rejects every independent native PR identity/automation mismatch: %p', (patch, reason) => {
  const facts = evidence();
  expect(assessDeploymentCandidateReplacement(initial(), request(), context(), { ...facts, promotion: { ...facts.promotion, ...patch } })).toEqual({ kind: 'blocked', reason });
});
it('accepts case-insensitive repository identity and a changed but still reachable closed PR head', () => {
  const facts = evidence();
  expect(assessDeploymentCandidateReplacement(initial(), request(), context(), { ...facts, promotion: {
    ...facts.promotion, repositoryFullName: 'OWNER/Project', headSha: candidateSha,
  } })).toEqual({ kind: 'allowed' });
});
it('short-circuits an invalid state even if the caller has no native evidence', () => {
  expect(assessDeploymentCandidateReplacement(initial({ revision: 4 }), request(), context(), undefined as never)).toEqual({ kind: 'blocked', reason: 'stale-revision' });
});
it('bounds predecessor history without truncation and refuses reused successor IDs', () => {
  const history = Array.from({ length: MAX_SUPERSEDED_DEPLOYMENT_CANDIDATES }, (_, index) => ({
    operationId: `operation-history-${index}`, revision: index + 1, sourceSha: oldSha, promotionPullRequest: index + 1, replacementSourceSha: candidateSha, replacementBaseSha: productionSha,
  }));
  expect(assessDeploymentCandidateReplacementState(initial({ supersededCandidates: history }), request())).toBe('history-limit');
  expect(() => buildReplacementDeploymentCandidate(initial({ supersededCandidates: history }), request(), 'operation-next')).toThrow('identity');
  expect(() => buildReplacementDeploymentCandidate(initial(), request(), 'operation-previous')).toThrow('identity');
  expect(() => buildReplacementDeploymentCandidate(initial(), request(), undefined as never)).toThrow('identity');
  const previous = initial({ supersededCandidates: history.slice(0, 1) });
  expect(() => buildReplacementDeploymentCandidate(previous, request(), history[0].operationId)).toThrow('identity');
  expect(() => buildReplacementDeploymentCandidate(initial({ promotionPullRequest: undefined }), request(), 'operation-next')).toThrow('identity');
  const next = buildReplacementDeploymentCandidate(previous, request(), 'operation-next');
  expect(next.supersededCandidates).toHaveLength(2); expect(previous.supersededCandidates).toHaveLength(1);
  expect(next.supersededCandidates?.[0]).toEqual(history[0]);
});
it('recognizes only the exact recorded replacement and preserves later accepted state on replay', () => {
  const next = buildReplacementDeploymentCandidate(initial(), request(), 'operation-successor');
  expect(isRecordedCandidateReplacement(next, request())).toBe(true);
  expect(isRecordedCandidateReplacement({ ...next, phase: 'promoted', productionSha }, request())).toBe(true);
  expect(isRecordedCandidateReplacement(initial(), request())).toBe(false);
  for (const patch of [{ operationId: 'operation-other' }, { expectedRevision: 4 }, { version: '1.5.3' },
    { candidateSha: oldSha }, { reviewedSourceSha: oldSha }, { productionBaseSha: oldSha }, { confirmedUnpublished: false }]) expect(isRecordedCandidateReplacement(next, request(patch))).toBe(false);
});


describe('explicit identity replacement in the durable state fence', () => {
  const candidate = () => buildReplacementDeploymentCandidate(initial(), request(), 'operation-successor');
  const expected = () => ({ kind: 'replacement' as const, fence: deploymentStateFence(initial()) });
  it('requires explicit replacement intent rather than a normal current-state write', () => {
    expect(decideDeploymentStateSave(readDeploymentOperationState(initial()), expected(), candidate())).toEqual({ kind: 'write' });
    expect(decideDeploymentStateSave(readDeploymentOperationState(initial()), { kind: 'current', fence: deploymentStateFence(initial()) }, candidate())).toMatchObject({ kind: 'invalid' });
  });
  it.each([
    { originSha: 'f'.repeat(40) }, { originBranch: 'other' }, { sourceBranch: 'release/other' },
    { version: '1.5.3', tag: 'v1.5.3' }, { productionBranch: 'other' }, { developmentBranch: 'other' },
    { title: 'Changed title' }, { changelog: 'Changed changelog' }, { prMode: 'auto-merge' },
    { locale: { repository: 'es-ES', issue: 'es-ES', pullRequest: 'es-ES' } },
    { supersededCandidates: undefined }, { promotionPullRequest: 174 }, { phase: 'promotion_pr_pending' },
  ] as const)('rejects immutable or reset-field drift in a replacement proposal: %p', patch => {
    const proposed = { ...candidate(), ...patch } as DeploymentOperationSnapshot;
    expect(decideDeploymentStateSave(readDeploymentOperationState(initial()), expected(), proposed)).toMatchObject({ kind: 'invalid' });
  });
  it('requires exact predecessor revision/source/PR/history and never rewrites a known predecessor', () => {
    for (const patch of [{ revision: 2 }, { sourceSha: 'f'.repeat(40) }, { promotionPullRequest: 19 }, { operationId: 'operation-unrelated' }]) {
      const proposed = candidate(); const previous = proposed.supersededCandidates![0];
      expect(decideDeploymentStateSave(readDeploymentOperationState(initial()), expected(), {
        ...proposed, supersededCandidates: [{ ...previous, ...patch }],
      })).toMatchObject({ kind: 'invalid' });
    }
  });
  it('retains accepted-state protection even if a caller forges replacement intent', () => {
    const accepted = initial({ phase: 'promoted', productionSha });
    expect(decideDeploymentStateSave(readDeploymentOperationState(accepted), { kind: 'replacement', fence: deploymentStateFence(accepted) }, candidate())).toMatchObject({ kind: 'invalid' });
  });
  it('does not turn a normal same-ID snapshot into a replacement', () => {
    expect(decideDeploymentStateSave(readDeploymentOperationState(initial()), expected(), { ...initial(), revision: 4 })).toMatchObject({ kind: 'invalid' });
  });
  it('recognizes a matching completed save response and rejects a moved native revision', () => {
    const proposed = candidate();
    expect(decideDeploymentStateSave(readDeploymentOperationState(proposed), expected(), proposed)).toMatchObject({ kind: 'already-applied', operation: proposed });
    expect(decideDeploymentStateSave(readDeploymentOperationState(initial({ revision: 4 })), expected(), proposed)).toMatchObject({ kind: 'stale' });
    expect(decideDeploymentStateSave(readDeploymentOperationState(initial({ operationId: 'operation-winner' })), expected(), proposed)).toMatchObject({ kind: 'conflict' });
  });
});

it('rejects recorded recovery with stale identity, accepted phase or contradictory publication facts', () => {
  const next = buildReplacementDeploymentCandidate(initial(), request(), 'operation-successor');
  const assess = (value: DeploymentOperationSnapshot, input = request()) => assessRecordedCandidateReplacementRecovery(value, input, context(), evidence());
  expect(assess(next, request({ operationId: 'operation-other' }))).toMatchObject({ reason: 'stale-operation' });
  expect(assess({ ...next, phase: 'promoted' })).toMatchObject({ reason: 'ineligible-phase' });
  for (const patch of [{ productionSha }, { publicationVerified: true }, { publicationReceipt: { tag: 'v1.5.2', productionSha, operationId: next.operationId, releaseUrl: 'https://example.test/release' } }, { reconciliationTargets: [{ targetBranch: 'develop', sourceBranch: 'master', sourceSha: productionSha, status: 'pending' as const }] }]) {
    expect(assess({ ...next, ...patch })).toMatchObject({ reason: 'publication-effects' });
  }
});
