import { createDefaultSetupConfiguration } from '../setup_configuration_defaults';
import { unavailableSetupRemoteConfiguration } from '../setup_remote_facts_policy';
import { DEFAULT_SETUP_RUNNERS, SETUP_RUNNER_REGISTRY, type SetupRunnerConfiguration, type SetupRunnerInventory } from '../../../domain/setup_runner';
import { parseSetupRunnerProfiles, validSetupRunnerProfile, validateSetupRunners, setupRunnerRegistry, setupRunnerProfileIsFresh,
  selectSetupRunnerMode, selectedSetupRunsOn, setupRunnerRole, setupRunnerReadiness, reusableSetupRunnerDefaults } from '../setup_runner_policy';

const profile = { id: 'vypdev-agent', group: 'vypdev', labels: ['self-hosted', 'codex', 'Linux'], validation: 'hosted' as const };
const registry = JSON.stringify({ schemaVersion: 1, profiles: [profile] });
const variable = { name: SETUP_RUNNER_REGISTRY, value: registry };
const remote = () => ({ ...unavailableSetupRemoteConfiguration(), repositoryVariablesAccess: 'available' as const,
  organizationVariablesAccess: 'available' as const, organizationVariables: [variable] });
const selected: SetupRunnerConfiguration = { mode: 'organization-profile', profileId: profile.id, group: profile.group,
  labels: profile.labels, validation: profile.validation, source: { scope: 'organization', value: registry } };
const manual: SetupRunnerConfiguration = { ...selectSetupRunnerMode('manual-self-hosted'), group: profile.group, labels: profile.labels };

describe('bounded non-secret runner profiles', () => {
  test.each([
    null, [], { ...profile, command: 'run' }, { ...profile, id: '' }, { ...profile, id: 'a'.repeat(51) },
    { ...profile, group: 1 }, { ...profile, group: 'x'.repeat(101) }, { ...profile, group: ' x' },
    { ...profile, group: '${{ secrets.PAT }}' }, { ...profile, group: 'x\ny' },
    { ...profile, validation: 'all-jobs' }, { ...profile, labels: null }, { ...profile, labels: [] },
    { ...profile, labels: Array(11).fill('linux') }, { ...profile, labels: ['self-hosted', 3] },
    { ...profile, labels: ['self-hosted', 'Linux', 'linux'] }, { ...profile, labels: ['Linux'] },
    { ...profile, labels: ['self-hosted', 'Windows', 'Linux'] }, { ...profile, labels: ['self-hosted', 'codex'] },
    { ...profile, labels: ['self-hosted', 'Linux', ''] }, { ...profile, labels: ['self-hosted', 'Linux', 'x'.repeat(101)] },
    { ...profile, group: `ghp_${'x'.repeat(36)}` }, { ...profile, id: `ghp_${'x'.repeat(36)}` },
    { ...profile, labels: ['self-hosted', 'Linux', `ghp_${'x'.repeat(36)}`] },
  ])('rejects unsafe or unsupported profile %#', value => expect(validSetupRunnerProfile(value)).toBe(false));
  test.each([profile, { ...profile, group: '', labels: ['SELF-HOSTED', 'macOS'], validation: 'agent' }])('accepts supported routing %#', value => expect(validSetupRunnerProfile(value)).toBe(true));
  test.each([
    '{', 'null', '[]', JSON.stringify({ schemaVersion: 2, profiles: [profile] }),
    JSON.stringify({ schemaVersion: 1, profiles: [profile], secret: 'unsupported' }),
    JSON.stringify({ schemaVersion: 1, profiles: {} }), JSON.stringify({ schemaVersion: 1, profiles: [] }),
    JSON.stringify({ schemaVersion: 1, profiles: Array(11).fill(profile) }),
    JSON.stringify({ schemaVersion: 1, profiles: [{ ...profile, labels: [] }] }),
    JSON.stringify({ schemaVersion: 1, profiles: [profile, { ...profile, id: 'VYPDEV-AGENT' }] }), ' '.repeat(16_001),
  ])('rejects invalid registries %#', value => expect(parseSetupRunnerProfiles(value)).toBeUndefined());
  test('returns isolated profile arrays', () => {
    const first = parseSetupRunnerProfiles(registry)!; const second = parseSetupRunnerProfiles(registry)!;
    expect(first).toEqual([profile]); expect(first[0].labels).not.toBe(second[0].labels);
  });
  test.each([
    null, [], { ...DEFAULT_SETUP_RUNNERS, token: 'no' }, { ...DEFAULT_SETUP_RUNNERS, mode: 'future' },
    { ...DEFAULT_SETUP_RUNNERS, group: 1 }, { ...DEFAULT_SETUP_RUNNERS, profileId: 4 },
    { ...DEFAULT_SETUP_RUNNERS, labels: 'linux' }, { ...DEFAULT_SETUP_RUNNERS, validation: 'future' },
    { ...DEFAULT_SETUP_RUNNERS, group: 'vypdev' }, { ...DEFAULT_SETUP_RUNNERS, profileId: 'id' },
    { ...DEFAULT_SETUP_RUNNERS, labels: ['Linux'] }, { ...DEFAULT_SETUP_RUNNERS, validation: 'agent' },
    { ...DEFAULT_SETUP_RUNNERS, source: {} }, { ...manual, labels: [] }, { ...manual, profileId: 'other' },
    { ...manual, source: selected.source }, { ...selected, profileId: '' }, { ...selected, source: null },
    { ...selected, source: { ...selected.source, token: 'no' } }, { ...selected, source: { scope: 'future', value: registry } },
    { ...selected, source: { scope: 'organization', value: 3 } }, { ...selected, source: { scope: 'organization', value: '{}' } },
    { ...selected, group: 'changed' }, { ...selected, validation: 'agent' }, { ...selected, labels: ['self-hosted', 'Linux'] },
  ])('rejects invalid configuration or mismatched snapshots %#', value => expect(validateSetupRunners(value)).toHaveLength(1));
  test.each([undefined, DEFAULT_SETUP_RUNNERS, selectSetupRunnerMode('hosted'), manual, selected])('accepts legacy and complete reviewed settings %#', value => expect(validateSetupRunners(value)).toEqual([]));
  test('defaults retain installed routing', () => expect(createDefaultSetupConfiguration().runners).toEqual(DEFAULT_SETUP_RUNNERS));
});

describe('effective registry and snapshot provenance', () => {
  test('absence and unavailable access are different', () => {
    expect(setupRunnerRegistry().status).toBe('unavailable');
    expect(setupRunnerRegistry(unavailableSetupRemoteConfiguration()).status).toBe('unavailable');
    expect(setupRunnerRegistry({ ...remote(), organizationVariablesAccess: 'unavailable' }).status).toBe('unavailable');
    expect(setupRunnerRegistry({ ...remote(), organizationVariables: [] }).status).toBe('missing');
  });
  test('reads organization profiles without writes', () => {
    const facts = remote(); expect(setupRunnerRegistry(facts)).toEqual({ status: 'available', scope: 'organization', profiles: [profile], source: selected.source });
    expect(facts.organizationVariables).toEqual([variable]);
  });
  test('repository overrides do not require organization inventory', () => {
    const facts = { ...remote(), organizationVariablesAccess: 'unavailable' as const, repositoryVariables: [variable] };
    expect(setupRunnerRegistry(facts).source?.scope).toBe('repository');
  });
  test.each(['bad', JSON.stringify({ schemaVersion: 2, profiles: [profile] })])('invalid repository registry shadows valid organization value: %s', value => {
    expect(setupRunnerRegistry({ ...remote(), repositoryVariables: [{ ...variable, value }] })).toEqual({ status: 'invalid', scope: 'repository', profiles: [] });
  });
  test('duplicate effective registry is invalid', () => expect(setupRunnerRegistry({ ...remote(), organizationVariables: [variable, variable] }).status).toBe('invalid'));
  test('profile freshness detects value, scope and visibility changes', () => {
    expect(setupRunnerProfileIsFresh(undefined, remote())).toBe(true);
    expect(setupRunnerProfileIsFresh(manual, remote())).toBe(true);
    expect(setupRunnerProfileIsFresh(selected, remote())).toBe(true);
    expect(setupRunnerProfileIsFresh(selected, { ...remote(), repositoryVariables: [variable] })).toBe(false);
    expect(setupRunnerProfileIsFresh(selected, { ...remote(), organizationVariables: [] })).toBe(false);
    expect(setupRunnerProfileIsFresh(selected, { ...remote(), organizationVariables: [{ ...variable, value: registry + ' ' }] })).toBe(false);
    expect(setupRunnerProfileIsFresh({ ...selected, source: undefined }, remote())).toBe(false);
  });
  test('batch defaults reuse only explicit choices and resolve each target registry', () => {
    expect(reusableSetupRunnerDefaults(undefined, remote())).toBeUndefined();
    expect(reusableSetupRunnerDefaults(DEFAULT_SETUP_RUNNERS, remote())).toBeUndefined();
    expect(reusableSetupRunnerDefaults(manual, remote())).toEqual(manual);
    expect(reusableSetupRunnerDefaults(manual, remote())?.labels).not.toBe(manual.labels);
    expect(reusableSetupRunnerDefaults(selected, remote())).toEqual(selected);
    expect(reusableSetupRunnerDefaults({ ...selected, discover: true }, remote())?.discover).toBe(true);
    expect(reusableSetupRunnerDefaults(selected, { ...remote(), organizationVariables: [] })).toBeUndefined();
    expect(reusableSetupRunnerDefaults(selected, { ...remote(), repositoryVariables: [variable] })?.source?.scope).toBe('repository');
  });
});

describe('job roles and explicit replacement', () => {
  test.each([
    ['copilot_issue.yml', 'copilot-issues'], ['copilot_issue_comment.yml', 'copilot-issues'],
    ['copilot_pull_request.yml', 'copilot-pull-requests'], ['copilot_pull_request_comment.yml', 'copilot-pull-requests'],
    ['copilot_commit.yml', 'copilot-commits'], ['agent-cli-provisioning.yml', 'verify-agent-clis'],
  ])('routes an agent job %s/%s', (file, job) => expect(setupRunnerRole(file, job)).toBe('agent'));
  test.each([
    ['copilot_pull_request_approval.yml', 'observe-approval', 'observer'],
    ['copilot_pull_request_merge_queue.yml', 'copilot-pull-request-required-check', 'isolated'],
    ['release_workflow.yml', 'publish', 'publication'], ['hotfix_workflow.yml', 'publish-npm', 'publication'],
    ['release_workflow.yml', 'prepare-version-files', 'validation'], ['hotfix_workflow.yml', 'validate', 'validation'],
    ['release_workflow.yml', 'custom-job', undefined], ['custom.yml', 'copilot-issues', undefined],
    ['copilot_branch_sync.yml', 'branch-sync', 'validation'], ['copilot_credential_health.yml', 'verify-pat', 'validation'],
    ['copilot_issue.yml', 'custom-job', undefined],
  ])('keeps role identity local to a known workflow %s/%s', (file, job, role) => expect(setupRunnerRole(file, job)).toBe(role));
  test.each(['observer', 'publication', 'isolated', undefined] as const)('protects the %s route', role => expect(selectedSetupRunsOn(manual, role)).toBeUndefined());
  test('retention makes no replacement', () => {
    expect(selectedSetupRunsOn(undefined, 'agent')).toBeUndefined();
    expect(selectedSetupRunsOn(DEFAULT_SETUP_RUNNERS, 'agent')).toBeUndefined();
  });
  test('hosted choice is explicit and validation remains separate', () => {
    expect(selectedSetupRunsOn(selectSetupRunnerMode('hosted'), 'agent')).toBe('ubuntu-latest');
    expect(selectedSetupRunsOn(manual, 'validation')).toBe('ubuntu-latest');
    expect(selectedSetupRunsOn(manual, 'agent')).toEqual({ group: 'vypdev', labels: profile.labels });
    expect(selectedSetupRunsOn({ ...manual, group: '', validation: 'agent' }, 'validation')).toEqual(profile.labels);
  });
});

describe('access and capacity never select a fallback', () => {
  const candidate = { id: 1, labels: profile.labels, status: 'online' as const, busy: false, group: 'vypdev', access: 'confirmed' as const };
  const inventory: SetupRunnerInventory = { status: 'available', candidates: [candidate], groups: [{ name: 'vypdev', access: 'confirmed' }] };
  const route = { group: 'vypdev', labels: ['SELF-HOSTED', 'Linux'] };
  test.each(['ubuntu-latest', ['macos-latest'], { labels: 'windows-2025' }])('recognizes literal hosted route %#', route => expect(setupRunnerReadiness(route)).toBe('hosted'));
  test.each(['${{ matrix.os }}', { group: '${{ vars.GROUP }}' }, ['${{ matrix.labels }}']])('keeps dynamic routing unverified %#', route => expect(setupRunnerReadiness(route, inventory)).toBe('access-unknown'));
  test('missing, incomplete and unavailable evidence cannot establish access', () => {
    expect(setupRunnerReadiness(route)).toBe('access-unknown');
    expect(setupRunnerReadiness(route, { ...inventory, status: 'incomplete' })).toBe('access-unknown');
    expect(setupRunnerReadiness(route, { ...inventory, status: 'unavailable' })).toBe('access-unknown');
  });
  test('case-insensitive labels match within the exact group', () => expect(setupRunnerReadiness(route, inventory)).toBe('ready'));
  test.each([{ busy: true }, { status: 'offline' as const }])('busy/offline capacity stays pending %#', update => {
    expect(setupRunnerReadiness(route, { ...inventory, candidates: [{ ...candidate, ...update }] })).toBe('pending-capacity');
  });
  test('workflow-restricted group access stays unknown', () => expect(setupRunnerReadiness(route, { ...inventory, candidates: [{ ...candidate, access: 'unknown' }] })).toBe('access-unknown'));
  test('confirmed group without matching labels is unavailable', () => expect(setupRunnerReadiness({ ...route, labels: ['self-hosted', 'macOS'] }, inventory)).toBe('unavailable'));
  test('unobserved groups and empty repository lists remain unknown', () => {
    expect(setupRunnerReadiness({ group: 'other', labels: 'self-hosted' }, inventory)).toBe('access-unknown');
    expect(setupRunnerReadiness(['self-hosted', 'macOS'], { status: 'available', candidates: [], groups: [] })).toBe('access-unknown');
    expect(setupRunnerReadiness({ group: 'other' }, inventory)).toBe('access-unknown');
  });
});
