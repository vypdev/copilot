import {
  renderDeploymentDashboard,
  renderSupersededDeploymentCandidate,
  type DeploymentPresentationContext,
} from '../deployment_presentation_policy';
import { resolveStaticDeploymentCatalog } from '../deployment_message_catalog';
import { renderCandidatePreflightSummary } from '../deployment_candidate_preflight_presentation';
import type { DeploymentCandidatePreflightOutcome } from '../../usecases/execution/deployment_candidate_preflight_workflow';
import type { DeploymentOperationSnapshot, SupersededDeploymentCandidate } from '../../../domain/deployment_operation';

const previous: SupersededDeploymentCandidate = { operationId: 'operation-previous', revision: 3, sourceSha: 'a'.repeat(40),
  promotionPullRequest: 173, replacementSourceSha: 'e'.repeat(40), replacementBaseSha: 'c'.repeat(40) };
const current: DeploymentOperationSnapshot = {
  stateVersion: 1, revision: 4, operationId: 'operation-successor', locale: { repository: 'en-US', issue: 'en-US', pullRequest: 'en-US' },
  kind: 'release', version: '1.5.2', title: 'Release', changelog: 'Changes', phase: 'promotion_pr_pending',
  strategy: 'production-lineage', prMode: 'create-only', backmergeMode: 'auto', hotfixActiveReleasePolicy: 'prefer-release',
  cleanup: 'all', issueCompletion: 'close', presentationMode: 'guided', diagrams: true, commentMode: 'update',
  sourceBranch: 'release/1.5.2', sourceSha: 'b'.repeat(40), originBranch: 'develop', originSha: 'd'.repeat(40),
  productionBranch: 'master', developmentBranch: 'develop', reconciliationTree: 'sync', promotionPullRequest: 174,
  tag: 'v1.5.2', publicationWorkflow: 'release.yml', publicationVerified: false, reconciliationTargets: [], lastFailure: null,
  supersededCandidates: [previous],
};
const context = (locale: string): DeploymentPresentationContext => ({ owner: 'owner', repository: 'project', issue: 170,
  repositoryLocale: locale, issueLocale: locale, pullRequestLocale: locale });
it.each([
  ['en-US', 'Candidate replaced', 'Do not reopen or merge'],
  ['es-ES', 'Candidato sustituido', 'No reabras ni mergees'],
  ['fr-FR', 'Candidate replaced', 'Do not reopen or merge'],
])('renders superseded status and one current-candidate action in %s/fallback', (locale, title, action) => {
  const text = renderSupersededDeploymentCandidate(previous, current, context(locale));
  expect(text).toContain(`## ${title}`); expect(text).toContain(action);
  expect(text).toContain('https://github.com/owner/project/issues/170');
  expect(text).toContain('https://github.com/owner/project/pull/173');
  expect(text).toContain(`https://github.com/owner/project/commit/${current.sourceSha}`);
  expect(text).toContain('operation-id="operation-previous"'); expect(text).toContain('operation-successor');
  expect(text.indexOf(action)).toBeLessThan(text.indexOf('<details>'));
  expect(text).not.toContain('Deployment is complete'); expect(text).not.toContain('already published');
});
it('uses the supplied whole-catalog locale and a deterministic marker/digest on replay', () => {
  const catalog = resolveStaticDeploymentCatalog('es-MX');
  const first = renderSupersededDeploymentCandidate(previous, current, context('en-US'), catalog);
  expect(first).toContain('Candidato sustituido');
  expect(renderSupersededDeploymentCandidate(previous, current, context('en-US'), catalog)).toBe(first);
});
it('retains the old candidate and its PR in current technical history without replacing normal pending status', () => {
  const text = renderDeploymentDashboard(current, context('en-US'));
  expect(text).toContain('waiting for production approval'); expect(text).toContain('operation-previous');
  expect(text).toContain('/pull/173'); expect(text).toContain(previous.sourceSha);
  expect(text.indexOf('operation-previous')).toBeGreaterThan(text.indexOf('<details>'));
});
it('keeps history when the current candidate later becomes accepted or published', () => {
  const published = { ...current, phase: 'published' as const, productionSha: 'c'.repeat(40), publicationVerified: true };
  const text = renderSupersededDeploymentCandidate(previous, published, context('en-US'));
  expect(text).toContain('before production acceptance'); expect(text).not.toContain('Package status: not published');
});
it('sanitizes technical identifiers and URL segments without executable Markdown or mentions', () => {
  const text = renderSupersededDeploymentCandidate({ ...previous, operationId: '<!-- @team `unsafe` -->' },
    { ...current, operationId: ':: @team `unsafe`' }, { ...context('en-US'), owner: 'evil](javascript:alert(1))' });
  expect(text).not.toContain('](javascript:'); expect(text).not.toContain('@team'); expect(text).not.toContain('<!-- @team');
});


it.each([
  ['en-US', 'Reviewed source', 'Prepared source'],
  ['es-ES', 'Fuente revisada', 'Fuente preparada'],
  ['fr-FR', 'Reviewed source', 'Prepared source'],
])('distinguishes reviewed input from a recorded prepared candidate in %s/fallback', (locale, reviewedLabel, preparedLabel) => {
  const outcome: DeploymentCandidatePreflightOutcome = {
    mode: 'prepare', issue: 170, version: '1.5.2', previousPromotion: 173,
    sourceBranch: current.sourceBranch, candidateSha: previous.replacementSourceSha,
    reviewedSourceSha: previous.replacementSourceSha, productionBaseSha: previous.replacementBaseSha,
    operationId: previous.operationId, expectedRevision: previous.revision,
    currentOperationId: previous.operationId, currentRevision: previous.revision,
  };
  const beforePreparation = renderCandidatePreflightSummary({ kind: 'success', outcome }, locale, 'owner/project');
  expect(beforePreparation).toContain(`[${reviewedLabel}](https://github.com/owner/project/commit/${outcome.reviewedSourceSha})`);
  expect(beforePreparation).not.toContain(`[${preparedLabel}]`);
  expect(beforePreparation).toContain(locale === 'es-ES' ? 'aún no se ha guardado la sustitución' : 'no replacement has been recorded yet');
  for (const mode of ['recover', 'recorded'] as const) {
    const afterPreparation = renderCandidatePreflightSummary({ kind: 'success', outcome: {
      ...outcome, mode, candidateSha: current.sourceSha,
      currentOperationId: current.operationId, currentRevision: current.revision,
    } }, locale, 'owner/project');
    expect(afterPreparation).toContain(`[${preparedLabel}](https://github.com/owner/project/commit/${current.sourceSha})`);
    expect(afterPreparation).not.toContain(`[${reviewedLabel}]`);
    expect(afterPreparation).not.toContain(`/commit/${outcome.reviewedSourceSha}`);
  }
});
