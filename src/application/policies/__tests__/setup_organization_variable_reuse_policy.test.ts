import { configureSetupOrganizationReuseStorage, planSetupOrganizationVariableReuse, buildSetupOrganizationReuseVariables } from '../setup_organization_variable_reuse_policy';
import { createDefaultSetupConfiguration } from '../setup_configuration_defaults';
import type { SetupRemoteConfiguration } from '../../../domain/setup';
const remote = (): SetupRemoteConfiguration => ({ ownerType: 'Organization', repositoryId: 7, repositoryVisibility: 'private',
  repositoryVariablesAccess: 'available', organizationVariablesAccess: 'available', repositorySecretsAccess: 'available',
  organizationSecretsAccess: 'available', organizationAccess: 'available', repositoryVariables: [{ name: 'OVERRIDE', value: 'local' }],
  organizationVariables: [{ name: 'SHARED', value: 'common' }, { name: 'OVERRIDE', value: 'common' }],
  repositorySecrets: ['PAT'], organizationSecrets: ['OPENAI_API_KEY'] });

describe('immutable shared Variable reuse plan', () => {
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
