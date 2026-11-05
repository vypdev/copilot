import { ApplicationError } from '../../errors/application_error';
import { buildApplicationErrorPresentation, renderApplicationErrorMarkdown } from '../application_error_presentation_policy';
import { resolveStaticApplicationErrorCatalog } from '../application_error_message_catalog';
import type { BranchSyncPublicationDiagnostic } from '../../../domain/branch_sync_publication';
const originalSha = 'a'.repeat(40), candidateSha = 'b'.repeat(40);
const facts: BranchSyncPublicationDiagnostic = { reason: 'workflow-write-required', remoteState: 'unchanged', originalSha, candidateSha, observedSha: originalSha, pushAttempted: true };
describe('Localized branch synchronization publication recovery', () => {
  it.each(['en-US', 'es-ES'].flatMap(locale => ['unchanged', 'changed', 'unverified'].map(remoteState => ({ locale, remoteState }))))(
    'renders complete safe $locale guidance for $remoteState', ({ locale, remoteState }) => {
      const diagnostic = { ...facts, remoteState, observedSha: remoteState === 'unverified' ? 'unavailable' : remoteState === 'changed' ? 'c'.repeat(40) : originalSha } as BranchSyncPublicationDiagnostic;
      const error = new ApplicationError('authorization.denied', 'PRIVATE provider output', { retryable: false,
        recovery: { id: 'branch-sync-workflow-write-required', variables: diagnostic } });
      const catalog = resolveStaticApplicationErrorCatalog(locale);
      const view = buildApplicationErrorPresentation(error, catalog.message), text = renderApplicationErrorMarkdown(error, catalog.message);
      expect(view.impact).toContain(locale === 'es-ES' ? 'rechazó' : 'rejected');
      expect(view.action).toContain('/copilot sync-branch');
      expect(view.action).toContain('https://docs.page/vypdev/copilot/security-operations/operations/troubleshooting#branch-sync-workflow-write-recovery');
      expect(view.retainedState).toContain(candidateSha); expect(view.retainedState).toContain(originalSha); expect(view.retainedState).toContain(diagnostic.observedSha);
      expect(view.retainedState).toContain(locale === 'es-ES' ? 'temporal' : 'temporary');
      expect(view.retainedState).toContain(locale === 'es-ES' ? 'Se intentó un push normal' : 'A normal push was attempted');
      if (remoteState === 'unverified') expect(view.retainedState).toContain(locale === 'es-ES' ? 'sin verificarse' : 'remains unknown');
      if (remoteState === 'changed') expect(view.retainedState).toContain(locale === 'es-ES' ? 'no determina' : 'does not establish');
      expect(text).not.toMatch(/PRIVATE|\{[a-zA-Z]+\}/u); expect(error.retryable).toBe(false);
    });
  it.each(['en-US', 'es-ES'])('does not promise a candidate identity or attempted push in %s', locale => {
    const error = new ApplicationError('provider.unavailable', 'PRIVATE', { retryable: false, recovery: { id: 'branch-sync-publication-failed',
      variables: { ...facts, reason: 'candidate-unverified', candidateSha: 'unavailable', pushAttempted: false } } });
    const view = buildApplicationErrorPresentation(error, resolveStaticApplicationErrorCatalog(locale).message);
    expect(view.retainedState).toContain('unavailable'); expect(view.retainedState).toContain(locale === 'es-ES' ? 'No se intentó ningún push' : 'No push was attempted');
    expect(view.action).toContain(locale === 'es-ES' ? 'no demuestra' : 'not proof');
  });
  it.each([
    { ...facts, remoteState: 'published', observedSha: candidateSha },
    { ...facts, reason: 'push-failed' }, { ...facts, privatePath: 'PRIVATE' },
  ])('rejects inconsistent recovery descriptors before rendering: %p', variables => {
    expect(() => new ApplicationError('authorization.denied', 'safe', { recovery: { id: 'branch-sync-workflow-write-required', variables } as never })).toThrow(TypeError);
  });
  it('rejects workflow-only facts mislabeled as generic publication failure', () => {
    expect(() => new ApplicationError('provider.unavailable', 'safe', { recovery: { id: 'branch-sync-publication-failed', variables: facts } })).toThrow(TypeError);
  });
});
