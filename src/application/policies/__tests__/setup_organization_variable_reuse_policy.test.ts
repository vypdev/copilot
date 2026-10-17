import { configureSetupOrganizationReuseStorage, planSetupOrganizationVariableReuse, buildSetupOrganizationReuseVariables } from '../setup_organization_variable_reuse_policy';
import { createDefaultSetupConfiguration, SETUP_AGENT_TASKS } from '../setup_configuration_defaults';
import { importSetupOrganizationConfiguration } from '../setup_organization_import_policy';
import type { SetupRemoteConfiguration } from '../../../domain/setup';
const remote = (): SetupRemoteConfiguration => ({ ownerType: 'Organization', repositoryId: 7, repositoryVisibility: 'private',
  repositoryVariablesAccess: 'available', organizationVariablesAccess: 'available', repositorySecretsAccess: 'available',
  organizationSecretsAccess: 'available', organizationAccess: 'available', repositoryVariables: [{ name: 'OVERRIDE', value: 'local' }],
  organizationVariables: [{ name: 'SHARED', value: 'common' }, { name: 'OVERRIDE', value: 'common' }],
  repositorySecrets: ['PAT'], organizationSecrets: ['OPENAI_API_KEY'] });

describe('immutable shared Variable reuse plan', () => {
  it.each(['organization', 'repository'] as const)('retains generic agent bindings from %s without freezing inherited task values', scope => {
    const snapshot = remote();
    const generic = [
      { name: 'AGENT_PROVIDER', value: 'codex' }, { name: 'AGENT_MODEL_PROVIDER', value: 'openai' },
      { name: 'AGENT_MODEL', value: 'gpt-6-luna' }, { name: 'AGENT_EFFORT', value: 'high' },
      { name: 'AGENT_EXECUTABLE', value: '/usr/local/bin/codex' },
    ];
    snapshot.organizationVariables = generic;
    snapshot.repositoryVariables = scope === 'repository' ? generic.map(variable => ({ ...variable })) : [];
    const before = JSON.stringify(snapshot);
    const imported = importSetupOrganizationConfiguration({ configuration: createDefaultSetupConfiguration(), remote: snapshot });
    const desired = buildSetupOrganizationReuseVariables(imported.configuration, snapshot)
      .filter(variable => generic.some(binding => variable.name === binding.name || SETUP_AGENT_TASKS.some(task => variable.name === binding.name.replace('AGENT_', `${task.toUpperCase()}_`))));
    const plan = planSetupOrganizationVariableReuse(desired, snapshot);
    expect(plan.repositoryWrites).toEqual([]);
    for (const binding of generic) for (const task of SETUP_AGENT_TASKS) {
      expect(plan.retained).toContainEqual({ name: binding.name.replace('AGENT_', `${task.toUpperCase()}_`), scope, sourceName: binding.name });
    }
    const storage = configureSetupOrganizationReuseStorage(imported.configuration, desired, snapshot);
    expect(storage.storage.variables.overrides.PLANNER_PROVIDER).toBe(scope);
    expect(JSON.stringify(snapshot)).toBe(before);
  });
  it.each([
    { repository: [{ name: 'AGENT_PROVIDER', value: 'codex' }], organization: [{ name: 'PLANNER_PROVIDER', value: 'cursor' }], retained: false },
    { repository: [{ name: 'PLANNER_PROVIDER', value: 'cursor' }], organization: [{ name: 'AGENT_PROVIDER', value: 'codex' }], retained: false },
    { repository: [{ name: 'PLANNER_PROVIDER', value: 'codex' }], organization: [{ name: 'AGENT_PROVIDER', value: 'cursor' }], retained: true },
    { repository: [{ name: 'AGENT_PROVIDER', value: 'cursor' }], organization: [{ name: 'PLANNER_PROVIDER', value: 'codex' }], retained: true },
  ])('keeps task-specific precedence ahead of a generic fallback: %j', scenario => {
    const snapshot = remote(); snapshot.repositoryVariables = scenario.repository; snapshot.organizationVariables = scenario.organization;
    const desired = [{ name: 'PLANNER_PROVIDER', value: 'codex' }];
    const plan = planSetupOrganizationVariableReuse(desired, snapshot);
    expect(plan.repositoryWrites).toEqual(scenario.retained ? [] : desired);
    if (scenario.retained) expect(plan.retained).toEqual([{ name: 'PLANNER_PROVIDER', scope: scenario.repository[0].name === 'PLANNER_PROVIDER' ? 'repository' : 'organization' }]);
  });
  it.each(['codex', 'cursor'])('preserves the reviewed task value %s when its generic binding changes', taskValue => {
    const snapshot = remote(); snapshot.organizationVariables = [{ name: 'AGENT_PROVIDER', value: 'codex' }];
    const desired = [{ name: 'AGENT_PROVIDER', value: 'cursor' }, { name: 'PLANNER_PROVIDER', value: taskValue }];
    expect(planSetupOrganizationVariableReuse(desired, snapshot)).toEqual({ retained: [], repositoryWrites: desired });
  });
  it('retains the repository generic override rather than its organization counterpart', () => {
    const snapshot = remote(); snapshot.repositoryVariables = [{ name: 'agent_provider', value: 'codex' }];
    snapshot.organizationVariables = [{ name: 'AGENT_PROVIDER', value: 'cursor' }];
    expect(planSetupOrganizationVariableReuse([{ name: 'PLANNER_PROVIDER', value: 'codex' }], snapshot)).toEqual({
      retained: [{ name: 'PLANNER_PROVIDER', scope: 'repository', sourceName: 'AGENT_PROVIDER' }], repositoryWrites: [],
    });
  });
  it('retains valid approval JSON with equivalent whitespace and property order', () => {
    const policy = { ...createDefaultSetupConfiguration().pullRequestApproval, mode: 'off' };
    const existing = JSON.stringify(Object.fromEntries(Object.entries(policy).reverse()), null, 2);
    const snapshot = remote(); snapshot.repositoryVariables = [{ name: 'PR_APPROVAL_POLICY', value: existing }];
    expect(planSetupOrganizationVariableReuse([{ name: 'PR_APPROVAL_POLICY', value: JSON.stringify(policy) }], snapshot))
      .toEqual({ retained: [{ name: 'PR_APPROVAL_POLICY', scope: 'repository' }], repositoryWrites: [] });
  });
  it('does not equate invalid or behaviorally different approval JSON', () => {
    const policy = { ...createDefaultSetupConfiguration().pullRequestApproval, mode: 'off' };
    for (const value of ['invalid', JSON.stringify({ ...policy, skipWhenHumanApproved: !policy.skipWhenHumanApproved })]) {
      const snapshot = remote(); snapshot.organizationVariables = [{ name: 'PR_APPROVAL_POLICY', value }];
      expect(planSetupOrganizationVariableReuse([{ name: 'PR_APPROVAL_POLICY', value: JSON.stringify(policy) }], snapshot).repositoryWrites).toHaveLength(1);
    }
  });
  it('retains effective values and plans reviewed differences only in the target repository', () => {
    const snapshot = remote(); const before = JSON.stringify(snapshot);
    expect(planSetupOrganizationVariableReuse([{ name: 'SHARED', value: 'common' }, { name: 'OVERRIDE', value: 'local' },
      { name: 'NEW', value: 'new' }, { name: 'CHANGED', value: 'change' }], snapshot)).toEqual({
      retained: [{ name: 'SHARED', scope: 'organization' }, { name: 'OVERRIDE', scope: 'repository' }],
      repositoryWrites: [{ name: 'NEW', value: 'new' }, { name: 'CHANGED', value: 'change' }],
    });
    expect(JSON.stringify(snapshot)).toBe(before);
  });
  it('does not overwrite a shared value when its imported answer was customized', () => {
    expect(planSetupOrganizationVariableReuse([{ name: 'SHARED', value: 'changed' }], remote())).toEqual({
      retained: [], repositoryWrites: [{ name: 'SHARED', value: 'changed' }],
    });
  });
  it.each(['ownerType', 'repositoryVariablesAccess', 'organizationVariablesAccess'] as const)('blocks unknown %s', key => {
    const snapshot = remote(); Object.assign(snapshot, { [key]: 'unknown' });
    expect(() => planSetupOrganizationVariableReuse([], snapshot)).toThrow('inventories');
  });
  it.each(['repositoryVariables', 'organizationVariables'] as const)('blocks ambiguous %s', key => {
    const snapshot = remote(); snapshot[key] = [{ name: 'SAME', value: 'a' }, { name: 'same', value: 'b' }];
    expect(() => planSetupOrganizationVariableReuse([], snapshot)).toThrow('ambiguous');
  });
  it('rejects invalid remote names', () => {
    const snapshot = remote(); snapshot.organizationVariables = [{ name: 'INVALID-NAME', value: 'a' }];
    expect(() => planSetupOrganizationVariableReuse([], snapshot)).toThrow('ambiguous');
  });
  it.each([{ desired: [{ name: 'lowercase', value: 'a' }] }, { desired: [{ name: 'SAME', value: 'a' }, { name: 'SAME', value: 'b' }] }])('rejects invalid or repeated desired names %j', ({ desired }) => {
    expect(() => planSetupOrganizationVariableReuse(desired, remote())).toThrow('desired');
  });
  it('ignores an unused inherited Project column when Projects are disabled', () => {
    const configuration = createDefaultSetupConfiguration(); configuration.projects.issueCreatedColumn = '';
    const snapshot = remote(); snapshot.organizationVariables = [{ name: 'PROJECT_COLUMN_ISSUE_CREATED', value: 'Source column' }];
    expect(buildSetupOrganizationReuseVariables(configuration, snapshot).some(variable => variable.name === 'PROJECT_COLUMN_ISSUE_CREATED')).toBe(false);
    configuration.projects.ids = '1';
    expect(() => buildSetupOrganizationReuseVariables(configuration, snapshot)).toThrow('explicit target value');
  });
  it('exposes repository overrides and preserved Secret bindings to existing storage review', () => {
    const configuration = createDefaultSetupConfiguration(); const before = JSON.stringify(configuration);
    expect(configureSetupOrganizationReuseStorage(configuration, [{ name: 'SHARED', value: 'common' },
      { name: 'OVERRIDE', value: 'local' }, { name: 'NEW', value: 'new' }], remote()).storage).toMatchObject({
      variables: { overrides: { SHARED: 'organization', OVERRIDE: 'repository', NEW: 'repository' } },
      secrets: { overrides: { PAT: 'repository' } },
    });
    expect(JSON.stringify(configuration)).toBe(before);
  });
  it.each(['secrets', 'variables'] as const)('blocks replacement of existing %s', kind => {
    const configuration = createDefaultSetupConfiguration(); configuration.storage[kind].preserveExisting = false;
    expect(() => configureSetupOrganizationReuseStorage(configuration, [], remote())).toThrow('preserving');
  });
});
