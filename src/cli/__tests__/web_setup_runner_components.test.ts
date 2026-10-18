import { useWebSetupRenderer } from '../../../test-support/web-setup-renderer';
import { runnerText } from '../../../web/src/i18n/runnerCopy';
import { questionOptionLabel, isQuestionOptionLocalized, suggestedQuestionAnswer } from '../../../web/src/i18n/questionOptions';
import type { SetupInstallationReview } from '../../domain/setup_runner';
import { renderSetupInstallationReview } from '../setup_installation_review_presenter';
import { toWebSetupPlan } from '../web_setup_bridge';
import { buildSetupPlan } from '../../application/policies/setup_configuration_plan';
import { createDefaultSetupConfiguration } from '../../application/policies/setup_configuration_defaults';
import { renderSetupPlan } from '../setup_plan_presenter';
import { tr } from '../../../web/src/i18n/catalog';

const markup = useWebSetupRenderer();
const review: SetupInstallationReview = { blockers: [], assets: [{ path: '.github/workflows/agent-cli-provisioning.yml', status: 'missing', enabled: false }],
  jobs: [{ file: 'copilot_issue.yml', job: 'copilot-issues', role: 'agent', runsOn: { group: 'vypdev', labels: ['self-hosted', 'codex', 'Linux'] }, status: 'pending-capacity', retained: false }],
  changes: [{ path: '.copilot/runner-profile.json', before: null, after: '<script>alert(1)</script>\nruns-on: [self-hosted, Linux]' }] };
describe('runner routing and parity review UI', () => {
  test.each(['en', 'es', 'fr', 'pt'] as const)('%s renders readable pending capacity, routing and complete before/after content', async locale => {
    const html = await markup('InstallationReview', { review }, locale);
    expect(html).toContain(runnerText('title', locale)); expect(html).toContain(runnerText('pending-capacity', locale));
    expect(html).toContain(runnerText('disabled', locale)); expect(html).toContain(runnerText('before', locale)); expect(html).toContain(runnerText('after', locale));
    expect(html).toContain('vypdev'); expect(html).toContain('self-hosted'); expect(html).toContain('&lt;script>'); expect(html).not.toContain('<script>alert');
  });
  test.each(['access-unknown', 'ready', 'hosted', 'unavailable'] as const)('renders textual %s state', async status => {
    const html = await markup('InstallationReview', { review: { ...review, jobs: [{ ...review.jobs[0], status, retained: true }] } });
    expect(html).toContain(runnerText(status, 'en')); expect(html).toContain('Retained');
  });
  test('blocking and incompatible findings are inspectable with an alert', async () => {
    const html = await markup('InstallationReview', { review: { ...review, blockers: ['Restore a compatible generator.'],
      assets: [{ path: '.copilot/repository-profile.json', status: 'incompatible', enabled: true }], changes: [{ path: 'retired.yml', before: 'old content', after: null }] } });
    expect(html).toContain('role="alert"'); expect(html).toContain('Restore a compatible generator.'); expect(html).toContain('old content'); expect(html).toContain('Absent');
    expect(renderSetupInstallationReview({ ...review, blockers: ['Restore a compatible generator.'], jobs: [{ ...review.jobs[0], retained: true }],
      assets: [{ path: 'future.json', status: 'incompatible', enabled: true }], changes: [{ path: 'retired.yml', before: 'old content', after: null }] })).toContain('Blocked: Restore a compatible generator.');
  });
  test.each(['en', 'es', 'fr', 'pt'] as const)('%s gives a localized recovery action before technical blocker details', async locale => {
    const html = await markup('InstallationReview', { review: { ...review, blockers: ['Restore a compatible generator.'] } }, locale);
    expect(html).toContain(runnerText('blockedAction', locale));
    expect(html.indexOf(runnerText('blockedAction', locale))).toBeLessThan(html.indexOf('Restore a compatible generator.'));
  });
  test('shared web plan and CLI retain the same routes and redacted content', () => {
    const plan = { ...buildSetupPlan(createDefaultSetupConfiguration()), installationReview: review };
    expect(toWebSetupPlan(plan).installationReview).toEqual(review);
    const terminal = renderSetupInstallationReview(review);
    expect(terminal).toContain('pending-capacity'); expect(terminal).toContain('vypdev'); expect(terminal).toContain('runs-on:');
    expect(renderSetupPlan(plan)).toContain('pending-capacity');
  });
  test.each(['en', 'es', 'fr', 'pt'] as const)('%s exposes manual recovery when discovery is unavailable', async locale => {
    const html = await markup('RunnerQuestionDetails', { question: { id: 'runners.mode', runnerRegistryStatus: 'unavailable', runnerInventory: { status: 'unavailable', candidates: [], groups: [] } } }, locale);
    expect(html).toContain('role="status"'); expect(html).toContain(runnerText('unavailable', locale)); expect(html).toContain(runnerText('help', locale));
    expect(questionOptionLabel('runners.mode', 'manual-self-hosted', locale)).toBe(runnerText('manual-self-hosted', locale));
    expect(questionOptionLabel('runners.validation', 'hosted', locale)).toBe(runnerText('validation-hosted', locale));
    expect(isQuestionOptionLocalized('runners.mode', 'retain', locale)).toBe(true);
  });
  test('profile IDs and discovered groups/labels remain text, not markup', async () => {
    const html = await markup('RunnerQuestionDetails', { question: { id: 'runners.group', runnerRegistryStatus: 'available',
      runnerProfiles: [{ id: 'shared', group: 'vypdev', labels: ['self-hosted', 'Linux'] }],
      runnerInventory: { status: 'available', groups: [{ name: '<b>bad</b>', access: 'unknown' }],
        candidates: Array.from({ length: 11 }, () => ({ labels: ['self-hosted', 'Linux'] })) } } });
    expect(html).toContain('shared'); expect(html).toContain('&lt;b>bad'); expect(html).not.toContain('<b>bad'); expect(html).toContain('first 10');
  });
  test.each(['repository', 'organization'] as const)('the selector discloses %s registry precedence', async scope => {
    const html = await markup('RunnerQuestionDetails', { question: { id: 'runners.mode', runnerRegistryStatus: 'invalid', runnerRegistryScope: scope } }, 'es');
    expect(html).toContain(tr(scope === 'repository' ? 'scopeRepository' : 'scopeOrganization', 'es'));
    expect(html).toContain(runnerText('invalid', 'es'));
  });
  test('unknown future status IDs remain inspectable as text', () => expect(runnerText('future-status', 'es')).toBe('future-status'));
  test.each([[true, 'Sí'], [false, 'No'], ['', 'ninguna'], [4, '4'], ['retain', runnerText('retain', 'es')]] as const)('localizes suggested answers without changing stored value: %s', (defaultValue, expected) => {
    const question = { id: 'runners.mode', stateId: 'agent-runtime' as const, label: 'runner', kind: 'choice' as const, defaultValue };
    expect(suggestedQuestionAnswer(question, 'es')).toBe(expected);
    expect(suggestedQuestionAnswer({ ...question, kind: 'text' }, 'es')).toBe(defaultValue === 'retain' ? 'retain' : expected);
    expect(suggestedQuestionAnswer({ ...question, kind: 'multi-select' }, 'es')).toBe(expected);
  });
});

test('pre-PAT discovery intent does not claim that inventory was already inspected', async () => {
  const html = await markup('RunnerQuestionDetails', { question: { id: 'runners.discover' } }, 'es');
  expect(html).not.toContain('role="status"'); expect(html).not.toContain(runnerText('unavailable', 'es'));
});

test.each(['en', 'es', 'fr', 'pt'] as const)('%s uses a localized empty suggestion when the profile question has no default', locale => {
  expect(suggestedQuestionAnswer({ id: 'runners.profileId', stateId: 'agent-runtime', label: 'Profile', kind: 'choice' }, locale)).toBe(tr('none', locale));
});

test('terminal review strips controls from every repository-controlled metadata field', () => {
  const unsafe = 'visible\u001b[2J\r\n\u202Ehidden';
  const result = renderSetupInstallationReview({ blockers: [unsafe], jobs: [{ ...review.jobs[0], file: unsafe, job: unsafe }],
    assets: [{ path: unsafe, status: 'customized', enabled: true }], changes: [{ path: unsafe, before: 'safe\ncontent', after: null }] });
  for (const control of ['\u001b', '\r', '\u202E']) expect(result).not.toContain(control);
  expect(result).not.toContain(unsafe);
  expect(result).not.toContain('safe\ncontent'); expect(result).toContain('visible[2Jhidden');
});

test('serialized runner routes strip C1 controls that JSON.stringify preserves', () => {
  const result = renderSetupInstallationReview({ ...review, jobs: [{ ...review.jobs[0], runsOn: ['self-hosted', 'Linux', '\u009b2J\u202e'] }] });
  expect(result).not.toContain('\u009b'); expect(result).not.toContain('\u202e');
  expect(result).toContain('self-hosted');
});

test.each(['en', 'es', 'fr', 'pt'] as const)('%s discloses the actual limit of workflow credential masking', async locale => {
  const html = await markup('InstallationReview', { review }, locale);
  expect(html).toContain(runnerText('redactionNotice', locale));
  expect(runnerText('redactionNotice', locale)).not.toBe('redactionNotice');
  expect(renderSetupInstallationReview(review)).toContain('literal contents omitted from terminal logs');
});


test('terminal summaries never log workflow literal values, including unrecognized custom secrets', () => {
  const privateValue = 'custom-sensitive-literal-not-a-known-token';
  const result = renderSetupInstallationReview({ ...review, changes: [
    { path: 'created.yml', before: null, after: `env:\n  CUSTOM_CREDENTIAL: ${privateValue}` },
    { path: 'updated.yml', before: `run: echo ${privateValue}`, after: `env:\n  CUSTOM: ${privateValue}` },
    { path: 'removed.yml', before: privateValue, after: null },
  ] });
  expect(result).not.toContain(privateValue); expect(result).not.toContain('CUSTOM_CREDENTIAL');
  expect(result).toContain('Create created.yml'); expect(result).toContain('Update updated.yml'); expect(result).toContain('Remove removed.yml');
  expect(result).toContain('--web');
});

test.each(['en', 'es', 'fr', 'pt'] as const)('%s identifies credential verification separately from ordinary validation', async locale => {
  const html = await markup('InstallationReview', { review: { ...review, jobs: [{ ...review.jobs[0], role: 'credential-health', runsOn: 'ubuntu-latest', status: 'hosted' }] } }, locale);
  expect(html).toContain(runnerText('credential-health', locale)); expect(runnerText('credential-health', locale)).not.toBe('credential-health');
  expect(html).toContain('ubuntu-latest');
});
