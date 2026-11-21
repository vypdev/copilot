import { setupPublisherFixture } from '../../application/policies/__tests__/fixtures/setup_publisher_fixture';
import { planSetupPublisherInstallation } from '../../application/policies/setup_publisher_plan_policy';
import { resolveStaticSetupPublisherCatalog } from '../../application/policies/setup_publisher_message_catalog';
import { SetupPublisherInstallationPresenter, setupPublisherInertText } from '../setup_publisher_installation_presenter';
import type { SetupPublisherOperation } from '../../domain/setup_publisher_installation';

const id = '11111111-1111-4111-8111-111111111111';
function fixture(locale = 'en-US') {
  const f = setupPublisherFixture(), plan = planSetupPublisherInstallation(f.proposal, f.inspection, id), lines: string[] = [];
  const catalog = resolveStaticSetupPublisherCatalog(locale), presenter = new SetupPublisherInstallationPresenter(catalog, text => lines.push(text));
  const operation: SetupPublisherOperation = { schemaVersion: 2, purpose: plan.purpose, operationId: id, repositoryId: plan.target.id,
    repository: 'owner/project', defaultBranch: 'main', baseSha: plan.target.baseSha, sourceCommit: plan.sourceCommit,
    planDigest: plan.digest, approvalDigest: plan.approvalDigest!, actorId: plan.actorId, status: 'partial',
    effects: ['tree', 'commit', 'branch'], preparedTree: 'a'.repeat(40), preparedCommit: 'b'.repeat(40), uncertain: 'pull-request' };
  return { ...f, plan, lines, catalog, presenter, operation };
}
it('renders every approved byte as inert prefixed data, retains CR/LF distinctions and leaves the frozen plan unchanged', () => {
  const f = fixture(), before = JSON.stringify(f.plan); f.presenter.preview(f.plan);
  for (const file of f.plan.files) for (const line of file.content!.split('\n')) expect(f.lines.join('')).toContain('  | '+line+'\n');
  expect(f.lines.join('')).toContain(f.plan.digest); expect(f.lines.join('')).toContain('SHA-256');
  expect(JSON.stringify(f.plan)).toBe(before);
  const unsafe = '\u001b]8;;https://untrusted.example\u0007link\u001b]8;;\u0007\r\n\t\u202e\u2028';
  expect(setupPublisherInertText(unsafe)).toBe('\\u{1b}]8;;https://untrusted.example\\u{7}link\\u{1b}]8;;\\u{7}\\r\n\\t\\u{202e}\\u{2028}');
  const data = { ...f.plan, files: [{ path: 'fixed.yml', content: unsafe }] };
  f.presenter.preview(data); expect(f.lines.join('')).not.toContain('\u001b'); expect(f.lines.join('')).not.toContain('\u202e');
  expect(f.lines.join('')).toContain('  | \\u{1b}]8;;https://untrusted.example');
});
it.each(['en-US', 'es-ES', 'fr-FR', 'pt-BR'])('renders review, retained uncertainty and delivery truthfully in %s', locale => {
  const f = fixture(locale); f.presenter.preview(f.plan, f.operation);
  expect(f.lines.join('')).toContain(f.catalog.message('uncertain', { effect: f.catalog.message('effect.pull-request') }));
  f.presenter.operation({ ...f.operation, effects: [], preparedTree: undefined, preparedCommit: undefined, uncertain: undefined }, true);
  expect(f.lines.join('')).toContain(f.catalog.message('noEffects')); expect(f.lines.join('')).toContain(f.catalog.message('journalUnconfirmed'));
  f.presenter.delivered({ ...f.operation, status: 'waiting-for-merge', effects: ['tree', 'commit', 'branch', 'pull-request'], pullRequestNumber: 73, uncertain: undefined });
  expect(f.lines.join('')).toContain('https://github.com/owner/project/pull/73');
  expect(f.lines.join('')).toContain(f.catalog.message('nativePending')); expect(f.lines.join('')).toContain(f.catalog.message('production'));
});
it('an unchanged view never promises new approved effects or an empty PR', () => {
  const f = fixture(); f.presenter.preview({ ...f.plan, status: 'unchanged', files: [], approvalDigest: null });
  expect(f.lines.join('')).toContain(f.catalog.message('unchanged')); expect(f.lines.join('')).not.toContain(f.catalog.message('effects'));
});
