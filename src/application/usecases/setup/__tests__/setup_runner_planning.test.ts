import { SetupWizardUseCase } from '../setup_wizard_use_case';
import { createDefaultSetupConfiguration } from '../../../policies/setup_configuration_defaults';
import { unavailableSetupRemoteConfiguration } from '../../../policies/setup_remote_facts_policy';
import { resolveRemoteConfiguration } from '../../actions/setup_resource_provisioning';
import type { SetupInstallationReview, SetupRunnerConfiguration } from '../../../../domain/setup_runner';

const profile = { id: 'shared', group: 'vypdev', labels: ['self-hosted', 'Linux'], validation: 'hosted' as const };
const value = JSON.stringify({ schemaVersion: 1, profiles: [profile] });
const runners: SetupRunnerConfiguration = { mode: 'organization-profile', discover: true, profileId: profile.id, group: profile.group,
  labels: profile.labels, validation: 'hosted', source: { scope: 'organization', value } };
const remote = { ...unavailableSetupRemoteConfiguration(), ownerType: 'Organization' as const, repositoryId: 7,
  repositoryVariablesAccess: 'available' as const, organizationVariablesAccess: 'available' as const,
  repositorySecretsAccess: 'available' as const, organizationSecretsAccess: 'available' as const, organizationAccess: 'available' as const,
  organizationVariables: [{ name: 'COPILOT_RUNNER_PROFILES', value }], defaultBranch: 'master' };
const review: SetupInstallationReview = { blockers: [], assets: [], changes: [], jobs: [{ file: 'copilot_issue.yml', job: 'copilot-issues',
  role: 'agent', runsOn: { group: 'vypdev', labels: profile.labels }, retained: false, status: 'access-unknown' }] };
const request = { mode: 'non-interactive' as const, remoteTarget: { owner: 'vypdev', repository: 'platform', token: 'fixture' },
  skipRepositoryVariables: true, skipRepositorySecrets: true, overrides: { runners, pullRequestApproval: { mode: 'off' as const } } };
function fixture() {
  return { planPresenter: { present: jest.fn() }, confirmation: { confirm: jest.fn(async () => ({ kind: 'approved' as const })) },
    finalPermissionAudit: { audit: jest.fn(async () => ({ status: 'accepted' as const })) },
    remoteConfiguration: { inspect: jest.fn(async () => remote) }, installationReview: { inspect: jest.fn(async () => review) },
    runnerDiscovery: { discover: jest.fn(async () => ({ status: 'available' as const, groups: [{ name: 'vypdev', access: 'confirmed' as const }],
      candidates: [{ id: 1, group: 'vypdev', labels: profile.labels, access: 'confirmed' as const, status: 'offline' as const, busy: false }] })) } };
}
describe('runner planning and stale-profile guards', () => {
  test('shared planning reports pending capacity without replacing the route', async () => {
    const dependencies = fixture(); const result = await new SetupWizardUseCase(dependencies).execute(request);
    expect(result.status).toBe('completed');
    if (result.status === 'completed') {
      expect(result.plan.installationReview?.jobs[0]).toMatchObject({ status: 'pending-capacity', runsOn: review.jobs[0].runsOn });
      expect(result.configuration.runners).toEqual(runners);
    }
    expect(dependencies.runnerDiscovery.discover).toHaveBeenCalledWith('vypdev', 'platform', 'fixture', 'Organization');
    expect(dependencies.finalPermissionAudit.audit).toHaveBeenCalledTimes(1);
  });
  test('optional discovery failure keeps manual recovery and access-unknown', async () => {
    const dependencies = fixture(); dependencies.runnerDiscovery.discover.mockRejectedValue(new Error('denied'));
    const result = await new SetupWizardUseCase(dependencies).execute({ ...request, previewOnly: true });
    expect(result.status).toBe('completed');
    if (result.status === 'completed') expect(result.plan.installationReview?.jobs[0]).toMatchObject({ status: 'access-unknown', runsOn: review.jobs[0].runsOn });
    expect(dependencies.finalPermissionAudit.audit).not.toHaveBeenCalled();
  });
  test.each(['changed', 'unavailable'] as const)('registry %s after review blocks before permission probes', async state => {
    const dependencies = fixture(); dependencies.remoteConfiguration.inspect.mockResolvedValueOnce(remote);
    if (state === 'changed') dependencies.remoteConfiguration.inspect.mockResolvedValueOnce({ ...remote, organizationVariables: [] });
    else dependencies.remoteConfiguration.inspect.mockRejectedValueOnce(new Error('denied'));
    await expect(new SetupWizardUseCase(dependencies).execute(request)).rejects.toThrow('runner registry changed or is unavailable');
    expect(dependencies.finalPermissionAudit.audit).not.toHaveBeenCalled(); expect(dependencies.planPresenter.present).toHaveBeenCalledTimes(1);
  });
  test('incompatible installation blocks preview completion before later credential/probe stages', async () => {
    const dependencies = fixture(); dependencies.installationReview.inspect.mockResolvedValue({ ...review, blockers: ['Restore a compatible generator.'] });
    await expect(new SetupWizardUseCase(dependencies).execute({ ...request, previewOnly: true })).rejects.toThrow('compatible generator');
    expect(dependencies.planPresenter.present).toHaveBeenCalled(); expect(dependencies.finalPermissionAudit.audit).not.toHaveBeenCalled();
  });
  test('Apply rereads the selected registry even when resource management is disabled', async () => {
    const configuration = { ...createDefaultSetupConfiguration(), runners, manageRepositoryVariables: false, manageRepositorySecrets: false };
    const errors: string[] = []; const inspect = jest.fn(async () => remote);
    expect(await resolveRemoteConfiguration({ setupRemoteConfiguration: remote }, { setupRemoteConfigurationReadPort: { inspect } }, configuration, errors)).toEqual(remote);
    expect(inspect).toHaveBeenCalledTimes(1); expect(errors).toEqual([]);
    inspect.mockResolvedValue({ ...remote, organizationVariables: [] });
    expect(await resolveRemoteConfiguration({ setupRemoteConfiguration: remote }, { setupRemoteConfigurationReadPort: { inspect } }, configuration, errors)).toBeUndefined();
    expect(errors.join(' ')).toContain('No changes were made');
  });
  test.each([false, true])('missing/failed registry reader cannot authorize a write: %s', fails => {
    const errors: string[] = []; const configuration = { ...createDefaultSetupConfiguration(), runners };
    return resolveRemoteConfiguration({}, fails ? { setupRemoteConfigurationReadPort: { inspect: async () => { throw new Error('denied'); } } } : {}, configuration, errors)
      .then(result => { expect(result).toBeUndefined(); expect(errors.join(' ')).toContain('runner registry changed'); });
  });
});


test('disabled discovery performs no optional provider request and retains an unverified route', async () => {
  const dependencies = fixture();
  const result = await new SetupWizardUseCase(dependencies).execute({ ...request, previewOnly: true,
    overrides: { ...request.overrides, runners: { ...runners, discover: false } } });
  expect(result.status).toBe('completed');
  if (result.status === 'completed') expect(result.plan.installationReview?.jobs[0].status).toBe('access-unknown');
  expect(dependencies.runnerDiscovery.discover).not.toHaveBeenCalled();
});

test.each([false, true])('an existing PAT can change discovery to %s during the full questionnaire', async discover => {
  const dependencies = fixture();
  const result = await new SetupWizardUseCase({ ...dependencies, collector: { collect: async initial => ({ ...initial,
    draft: { ...initial.draft, runners: { ...initial.draft.runners!, discover } }, stateId: 'review', terminal: 'review' }) } }).execute({
    ...request, mode: 'interactive', previewOnly: true, overrides: { ...request.overrides, runners: { ...runners, discover: !discover } } });
  expect(result.status).toBe('completed');
  if (result.status === 'completed') expect(result.plan.installationReview?.jobs[0].status).toBe(discover ? 'pending-capacity' : 'access-unknown');
  expect(dependencies.runnerDiscovery.discover).toHaveBeenCalledTimes(1);
});

test('discovery enabled after PAT entry can be denied without blocking exact reviewed routing', async () => {
  const dependencies = fixture(); dependencies.runnerDiscovery.discover.mockRejectedValue(new Error('denied'));
  const result = await new SetupWizardUseCase({ ...dependencies, collector: { collect: async initial => ({ ...initial,
    draft: { ...initial.draft, runners: { ...initial.draft.runners!, discover: true } }, stateId: 'review', terminal: 'review' }) } }).execute({
    ...request, mode: 'interactive', previewOnly: true, overrides: { ...request.overrides, runners: { ...runners, discover: false } } });
  expect(result.status).toBe('completed');
  if (result.status === 'completed') expect(result.plan.installationReview?.jobs[0]).toMatchObject({ status: 'access-unknown', runsOn: review.jobs[0].runsOn });
  expect(dependencies.runnerDiscovery.discover).toHaveBeenCalledTimes(1); expect(dependencies.finalPermissionAudit.audit).not.toHaveBeenCalled();
});
