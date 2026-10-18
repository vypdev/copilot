import { setupRunnerInstallationSummary } from '../setup_runner_installation_summary_policy';
import { createDefaultSetupConfiguration } from '../setup_configuration_defaults';
import { selectSetupRunnerMode } from '../setup_runner_policy';
import type { SetupBatchTargetPlan } from '../../../domain/setup_batch';

const plan = () => ({ configuration: createDefaultSetupConfiguration(), digest: 'a'.repeat(64) } as SetupBatchTargetPlan);
describe('non-secret installation PR summary', () => {
  test.each([undefined, selectSetupRunnerMode('retain')])('legacy installation without a review keeps its existing PR body %#', runners => {
    const target = plan(); target.configuration.runners = runners; expect(setupRunnerInstallationSummary(target)).toBe('');
  });
  test('explicit hosted selection explains its route even without an optional review', () => {
    const target = plan(); target.configuration.runners = selectSetupRunnerMode('hosted');
    expect(setupRunnerInstallationSummary(target)).toContain('"ubuntu-latest"');
  });
  test('shared source values never enter PR content and role exceptions stay explicit', () => {
    const target = plan(); const profile = { id: 'shared', group: 'vypdev', labels: ['self-hosted', 'Linux'], validation: 'hosted' as const };
    target.configuration.runners = { mode: 'organization-profile', profileId: 'shared', group: profile.group, labels: profile.labels,
      validation: 'hosted', source: { scope: 'organization', value: 'private-registry-evidence' } };
    const jobs = (['pending-capacity', 'access-unknown', 'unavailable', 'ready'] as const).map(status => ({ file: 'copilot_issue.yml', job: 'copilot-issues',
      role: 'agent' as const, runsOn: profile.labels, retained: false, status }));
    const assets = (['source-only', 'missing', 'customized', 'incompatible', 'shared'] as const).map(status => ({ path: 'fixture.yml', enabled: true, status }));
    const summary = setupRunnerInstallationSummary({ ...target, installationReview: { blockers: [], jobs, assets, changes: [] } });
    expect(summary).toContain('1 pending capacity; 1 access unverified; 1 unavailable');
    expect(summary).toContain('1 source extensions'); expect(summary).toContain('1 incompatible metadata');
    expect(summary).toContain('Human merge'); expect(summary).toContain('native source workflows');
    expect(summary).toContain('vypdev'); expect(summary).not.toContain('private-registry-evidence');
  });
  test('retained routing with a review needs no invented profile', () => {
    const target = plan(); target.configuration.runners = undefined;
    expect(setupRunnerInstallationSummary({ ...target, installationReview: { blockers: [], assets: [], jobs: [], changes: [] } })).toContain('Installed per-job routing is retained');
  });
});
