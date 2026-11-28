import { setupPublisherFixture } from '../../application/policies/__tests__/fixtures/setup_publisher_fixture';
import { planSetupPublisherInstallation } from '../../application/policies/setup_publisher_plan_policy';
import { resolveStaticSetupPublisherCatalog } from '../../application/policies/setup_publisher_message_catalog';
import { SetupPublisherInstallationPresenter, setupPublisherInertText } from '../setup_publisher_installation_presenter';
import type { SetupPublisherOperation } from '../../domain/setup_publisher_installation';
import type { SetupPublisherBlockedReview } from '../../application/ports/setup_publisher_review_ports';

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
function reviewedInventory() {
  return { pullRequest: 81, head: '6'.repeat(40), base: '7'.repeat(40), documentSha256: 'a'.repeat(64),
    workflowSetSha256: 'b'.repeat(64), closureSha256: 'c'.repeat(64), contractSha256: 'd'.repeat(64), decisionsSha256: 'e'.repeat(64),
    approvals: [{ reviewId: 101, actorId: 17, actorLogin: 'reviewer' }],
    workflows: [{ path: '.github/workflows/ci.yml', disposition: 'non-producer' as const }] };
}
it.each(['applying', 'partial', 'waiting-for-merge', 'verification-pending'] as const)(
  'publisher977-C109: %s output links the known saved operation without inventing a run', status => {
    const f = fixture(), url = `file:///owned/setup-operations/${id}.json`;
    const operation = { ...f.operation, status,
      ...(status === 'waiting-for-merge' || status === 'verification-pending' ? { pullRequestNumber: 73 } : {}) };
    const present = f.presenter.operation.bind(f.presenter) as (operation: SetupPublisherOperation, unconfirmed: boolean, url: string) => void;
    present(operation, false, url);
    expect(f.lines.join('')).toContain(url);
    expect(f.lines.join('')).toContain(id);
    expect(f.lines.join('')).not.toContain('/actions/runs/');
    if (operation.pullRequestNumber) expect(f.lines.join('')).toContain('https://github.com/owner/project/pull/73');
  },
);
it('publisher977-C109: absent or unsafe record targets never create a navigation promise', () => {
  const f = fixture();
  const present = f.presenter.operation.bind(f.presenter) as (operation: SetupPublisherOperation, unconfirmed: boolean, url?: string) => void;
  for (const url of [undefined, 'https://untrusted.example/record', 'file://untrusted-host/record.json', 'not a URL',
    `file:///owned/${id}.json?token=private`, `file:///owned/${id}.json#fragment`,
    'file:///owned/22222222-2222-4222-8222-222222222222.json', `file:///owned/\u001b${id}.json`]) {
    present(f.operation, true, url);
  }
  expect(f.lines.join('')).not.toContain('https://untrusted');
  expect(f.lines.join('')).not.toContain('file://untrusted');
  expect(f.lines.join('')).not.toContain('not a URL');
  expect(f.lines.join('')).not.toContain('file:');
  expect(f.lines.join('')).not.toContain('/actions/runs/');
  expect(f.lines.join('')).toContain(f.catalog.message('journalUnconfirmed'));
});
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
  const f = fixture(locale), url = `file:///owned/${id}.json`; f.presenter.preview(f.plan, f.operation, url);
  expect(f.lines.join('')).toContain(f.catalog.message('operationRecord', { url }));
  f.presenter.operation({ ...f.operation, status: 'verification-pending', pullRequestNumber: 73 });
  expect(f.lines.join('')).toContain(f.catalog.message('knownPullRequest', { url: 'https://github.com/owner/project/pull/73' }));
  expect(f.lines.join('')).toContain(f.catalog.message('uncertain', { effect: f.catalog.message('effect.pull-request') }));
  f.presenter.operation({ ...f.operation, effects: [], preparedTree: undefined, preparedCommit: undefined, uncertain: undefined }, true);
  expect(f.lines.join('')).toContain(f.catalog.message('noEffects')); expect(f.lines.join('')).toContain(f.catalog.message('journalUnconfirmed'));
  f.presenter.delivered({ ...f.operation, status: 'waiting-for-merge', effects: ['tree', 'commit', 'branch', 'pull-request'], pullRequestNumber: 73, uncertain: undefined });
  expect(f.lines.join('')).toContain('https://github.com/owner/project/pull/73');
  expect(f.lines.join('')).toContain(f.catalog.message('nativePending')); expect(f.lines.join('')).toContain(f.catalog.message('production'));
});
it('an unchanged view never promises new approved effects or an empty PR', () => {
  const f = fixture(); f.presenter.preview({ ...f.plan, status: 'unchanged', files: [], approvalDigest: null, inventoryReview: reviewedInventory() });
  expect(f.lines.join('')).toContain(f.catalog.message('unchanged')); expect(f.lines.join('')).not.toContain(f.catalog.message('effects'));
  expect(f.lines.join('')).toContain(f.catalog.message('inventoryUnchanged'));
  expect(f.lines.join('')).not.toContain(f.catalog.message('inventorySeparate'));
});
it('publisher-inventory-C43: a missing review view shows retained facts and one current review action without a plan', () => {
  const f = fixture(), view: SetupPublisherBlockedReview = { reason: 'review-required', operationId: id, repository: 'owner/project',
    evidence: { pullRequest: 81, head: '6'.repeat(40), documentSha256: '7'.repeat(64) } };
  f.presenter.inventoryBlocked(view, { ...f.operation, pullRequestNumber: 73 });
  const text = f.lines.join(''), normalized = text.replace(/\s+/gu, ' ');
  expect(normalized).toContain(f.catalog.message('inventoryRequired'));
  expect(text).toContain('https://github.com/owner/project/pull/73');
  expect(text).toContain('https://github.com/owner/project/pull/81');
  expect(text).not.toContain(f.catalog.message('effects')); expect(text).not.toContain('Complete file:');
  expect(text).not.toContain(f.catalog.message('recovery')); expect(text).not.toContain('APPROVE');
});
it('publisher-inventory-C44: incompatible and unresolved inventories have distinct causes and migration/review actions', () => {
  const results: string[] = [];
  for (const reason of ['incompatible-producer', 'unresolved-closure'] as const) {
    const f = fixture(); f.presenter.inventoryBlocked({ reason, operationId: id, repository: 'owner/project',
      evidence: { pullRequest: 81, head: '6'.repeat(40), documentSha256: '7'.repeat(64) } });
    const text = f.lines.join('').replace(/\s+/gu, ' '); results.push(text);
    expect(text).toContain(f.catalog.message(reason === 'incompatible-producer' ? 'inventoryIncompatible' : 'inventoryUnresolved'));
    expect(text).not.toContain(f.catalog.message('preview')); expect(text).not.toContain(f.catalog.message('unchanged'));
  }
  expect(results[0]).not.toBe(results[1]);
});
it('publisher-inventory-C47: a partial view preserves known operation and PR links without claiming rollback', () => {
  const f = fixture(), record = `file:///owned/${id}.json`;
  f.presenter.inventoryBlocked({ reason: 'review-unavailable', operationId: id, repository: 'owner/project',
    evidence: { pullRequest: 81, head: '6'.repeat(40), documentSha256: '7'.repeat(64) } },
  { ...f.operation, pullRequestNumber: 73, uncertain: 'pull-request' }, record);
  const text = f.lines.join('');
  expect(text).toContain(record); expect(text).toContain('https://github.com/owner/project/pull/73');
  expect(text).toContain(f.operation.preparedTree!); expect(text).toContain(f.operation.preparedCommit!);
  expect(text).toContain(f.catalog.message('uncertain', { effect: f.catalog.message('effect.pull-request') }));
  expect(text).not.toMatch(/rolled back|removed|installation complete/iu);
});
it.each(['en-US', 'es-ES', 'fr-FR', 'pt-BR', 'de-DE'])(
  'publisher-inventory-C48: %s blocked output wraps narrow prose and rejects unsafe evidence coordinates', locale => {
    const f = fixture(locale), presenter = new SetupPublisherInstallationPresenter(f.catalog, text => f.lines.push(text), 40);
    const view: SetupPublisherBlockedReview = { reason: 'review-required', operationId: id, repository: 'owner/project',
      evidence: { pullRequest: 81, head: '6'.repeat(40), documentSha256: '7'.repeat(64) } };
    presenter.inventoryBlocked(view);
    expect(f.lines.join('')).toContain('https://github.com/owner/project/pull/81');
    expect(f.lines.join('').replace(/\s+/gu, ' ')).toContain(f.catalog.message('inventoryRequired'));
    expect(f.lines.flatMap(line => line.trimEnd().split('\n')).every(line => Array.from(line).length <= 40 || line.includes('https://'))).toBe(true);
    f.lines.length = 0;
    presenter.inventoryBlocked({ ...view, repository: 'owner/project?token=private-credential@someone<!--marker-->',
      operationId: '\u202eprivate-credential', evidence: { ...view.evidence, head: '\u001bprivate-credential' } });
    const unsafe = f.lines.join(''); expect(unsafe).not.toContain('private-credential'); expect(unsafe).not.toContain('@someone');
    expect(unsafe).not.toContain('<!--marker-->'); expect(unsafe).not.toContain('https://'); expect(unsafe).not.toContain('\u001b'); expect(unsafe).not.toContain('\u202e');
    expect(f.catalog.message('inventoryNoAuthority')).toBeTruthy(); if (locale === 'de-DE') expect(f.catalog.locale).toBe('en-US');
  },
);
it.each(['en-US', 'es-ES', 'fr-FR', 'pt-BR', 'de-DE'])(
  'publisher-inventory-C45/C48: %s separates a verified inventory review from installation approval', locale => {
    const f = fixture(locale);
    const inventoryReview = reviewedInventory();
    const plan = { ...f.plan, inventoryReview }, before = JSON.stringify(plan);
    f.presenter.preview(plan);
    const text = f.lines.join('');
    expect(text).toContain(f.catalog.message('inventoryReview', { count: '1' }));
    expect(text).toContain(f.catalog.message('inventoryEvidence', { url: 'https://github.com/owner/project/pull/81', head: inventoryReview.head }));
    expect(text).toContain(f.catalog.message('inventorySeparate'));
    expect(text.indexOf(f.catalog.message('inventorySeparate'))).toBeLessThan(text.indexOf(f.catalog.message('effects')));
    expect(text).toContain(f.catalog.message('nativePending'));
    expect(text).not.toContain('@reviewer'); expect(text).not.toContain('/actions/runs/');
    expect(JSON.stringify(plan)).toBe(before);
    if (locale === 'de-DE') expect(f.catalog.locale).toBe('en-US');
  },
);
