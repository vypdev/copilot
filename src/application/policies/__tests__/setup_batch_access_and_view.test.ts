import { createDefaultSetupConfiguration, SETUP_AGENT_TASKS } from '../setup_configuration_defaults';
import { buildSetupRepositoryVariables } from '../setup_configuration_plan';
import { planSetupBatchSharedAccess } from '../setup_batch_access_policy';
import { beginSetupBatchOperation, assertSetupBatchOperationMatchesPlan } from '../setup_batch_policy';
import { buildSetupBatchView } from '../setup_batch_view_policy';
import { selectedExistingSetupCredentials } from '../setup_credential_binding_policy';
import { setupOrganizationExplicitQuestionIds } from '../setup_organization_variable_bindings';
import { importSetupOrganizationConfiguration } from '../setup_organization_import_policy';
import { configureSetupOrganizationReuseStorage } from '../setup_organization_variable_reuse_policy';
import { hasCompleteSetupSecretRevisions } from '../setup_remote_facts_policy';
import type { SetupBatchPlan, SetupBatchSharedResource, SetupBatchTarget } from '../../../domain/setup_batch';
import type { SetupRemoteConfiguration } from '../../../domain/setup';
const target: SetupBatchTarget = { id: 7, ownerId: 3, owner: 'acme', name: 'repo', baseSha: 'a'.repeat(40), defaultBranch: 'master', private: true, archived: false, disabled: false, canPush: true };
function fixture() {
  const configuration = createDefaultSetupConfiguration(); configuration.pullRequestApproval = { ...configuration.pullRequestApproval, mode: 'off' };
  const variables = buildSetupRepositoryVariables(configuration);
  const remote: SetupRemoteConfiguration = { ownerType: 'Organization', repositoryId: 7, repositoryVisibility: 'private', repositoryVariables: [], repositoryVariablesAccess: 'available',
    organizationVariables: variables, organizationVariablesAccess: 'available', repositorySecrets: [], repositorySecretsAccess: 'available', organizationSecrets: [], organizationSecretsAccess: 'available', organizationAccess: 'available' };
  const shared: SetupBatchSharedResource[] = variables.map(variable => ({ ...variable, kind: 'variable', visibility: 'selected', selectedRepositoryIds: [], updatedAt: '2026-10-17T00:00:00Z' }));
  shared.push({ kind: 'secret', name: 'PAT', visibility: 'selected', selectedRepositoryIds: [], updatedAt: '2026-10-17T00:00:00Z' });
  return { configuration, remote, shared };
}
describe('consumed shared bindings and redacted review policy', () => {
  it.each(['organization', 'repository'] as const)('tracks only the real generic %s binding in shared snapshots and grants', scope => {
    const f = fixture();
    f.shared = f.shared.filter(resource => !SETUP_AGENT_TASKS.some(task => resource.name.startsWith(`${task.toUpperCase()}_`)));
    if (scope === 'repository') f.remote.repositoryVariables = f.shared.filter(resource => resource.kind === 'variable' && resource.name.startsWith('AGENT_'))
      .map(resource => ({ name: resource.name, value: resource.value! }));
    const result = planSetupBatchSharedAccess(f.configuration, target, f.remote, f.shared);
    expect(result.variables.repositoryWrites).toEqual([]);
    const providerGrants = result.grants.filter(grant => grant.kind === 'variable' && grant.name.endsWith('_PROVIDER'));
    expect(providerGrants).toEqual(scope === 'repository' ? [] : [
      { kind: 'variable', name: 'AGENT_PROVIDER', repositoryId: target.id },
      { kind: 'variable', name: 'AGENT_MODEL_PROVIDER', repositoryId: target.id },
    ]);
    expect(result.sharedSnapshot.some(resource => SETUP_AGENT_TASKS.some(task => resource.name.startsWith(`${task.toUpperCase()}_`)))).toBe(false);
    expect(result.sharedSnapshot.some(resource => resource.name === 'AGENT_PROVIDER')).toBe(scope === 'organization');
  });
  it('projects inspected Secret revisions without claiming that pending access already applies', () => {
    const f = fixture(); const result = planSetupBatchSharedAccess(f.configuration, target, f.remote, f.shared);
    expect(result.projected.organizationSecretRevisions).toEqual([{ name: 'PAT', updatedAt: '2026-10-17T00:00:00Z' }]);
    expect(hasCompleteSetupSecretRevisions(result.projected)).toBe(true);
    expect(result.grants).toContainEqual({ kind: 'secret', name: 'PAT', repositoryId: target.id });
    expect(f.remote.organizationSecrets).toEqual([]); expect(f.shared.at(-1)?.selectedRepositoryIds).toEqual([]);
  });
  it('does not grant access to an unused credential alternative or a shadowed binding', () => {
    const f = fixture(); f.remote.repositorySecrets = ['PAT', 'OPENAI_API_KEY'];
    f.shared.push({ kind: 'secret', name: 'OPENAI_API_KEY', visibility: 'selected', selectedRepositoryIds: [], updatedAt: '2026-10-17T00:00:00Z' });
    const result = planSetupBatchSharedAccess(f.configuration, target, f.remote, f.shared);
    expect(result.sharedSnapshot.some(resource => resource.kind === 'secret')).toBe(false);
    expect(result.grants.some(grant => grant.kind === 'secret')).toBe(false);
  });
  it('does not assume a selected binding is effective when Secret management is disabled', () => {
    const f = fixture(); f.configuration.manageRepositorySecrets = false; f.configuration.manageRepositoryVariables = false;
    const result = planSetupBatchSharedAccess(f.configuration, target, f.remote, f.shared);
    expect(result.grants).toEqual([]); expect(result.missing).toContain('PAT'); expect(result.variables.repositoryWrites).toEqual([]);
  });
  it('keeps available all/private bindings without expanding visibility', () => {
    const f = fixture(); f.shared.forEach((resource, index) => { f.shared[index] = { ...resource, visibility: 'private' }; });
    const result = planSetupBatchSharedAccess(f.configuration, target, f.remote, f.shared);
    expect(result.grants).toEqual([]); expect(result.missing).toEqual([]);
  });
  it('reports unsatisfied provider groups when no runner authentication can satisfy them', () => {
    const f = fixture(); for (const key of SETUP_AGENT_TASKS) {
      if (f.configuration.agents[key]) f.configuration.agents[key] = { ...f.configuration.agents[key], provider: 'opencode', modelProvider: 'anthropic' };
    }
    const result = planSetupBatchSharedAccess(f.configuration, target, f.remote, f.shared);
    expect(result.missing.length).toBeGreaterThan(0);
  });
  it('selects the first existing alternative once for a satisfied group', () => {
    const requirements = [{ name: 'A', kind: 'apiKey' as const, description: 'Provider key', alternativeGroups: ['g'] }, { name: 'B', kind: 'apiKey' as const, description: 'Provider key', alternativeGroups: ['g'] }];
    const f = fixture(); f.remote.organizationSecrets = ['A', 'B'];
    expect(selectedExistingSetupCredentials(requirements, f.remote).map(value => value.name)).toEqual(['A']);
  });
  it('accepts absent explicit overrides and distinguishes a conflicting Secret scope', () => {
    expect(setupOrganizationExplicitQuestionIds(undefined)).toEqual([]);
    const f = fixture(); f.remote.repositorySecrets = ['PAT']; f.configuration.storage.secrets.overrides.PAT = 'organization';
    expect(() => configureSetupOrganizationReuseStorage(f.configuration, [], f.remote)).toThrow('cannot move');
  });
  it.each(['features.issues', 'features.hotfix'])('keeps explicit capability %s ahead of an organization profile', explicit => {
    const f = fixture(); if (explicit === 'features.issues') f.configuration.features.issues = false;
    f.remote.organizationVariables = [{ name: 'COPILOT_ISSUE_WORKFLOW_PROFILE', value: '{"schemaVersion":1,"enabled":["bugfix"]}' }];
    const result = importSetupOrganizationConfiguration({ configuration: f.configuration, remote: f.remote, explicitQuestionIds: [explicit] });
    expect(result.settings[0].status).toBe('needs-review');
  });
  it('renders active unblocked plans with retained Secret names, probes, reasons and safe PR links', () => {
    const f = fixture(); const access = planSetupBatchSharedAccess(f.configuration, target, f.remote, f.shared);
    const plan: SetupBatchPlan = { operationId: 'a67c8e40-93be-43ed-a7ed-e07378c7e773', organization: 'acme', targets: [{ target,
      configuration: f.configuration, remote: f.remote, files: [{ path: 'AGENTS.md', content: 'safe' }], repositoryVariables: [], grants: access.grants, sharedSnapshot: access.sharedSnapshot,
      digest: 'b'.repeat(64), blocked: [] }] };
    const operation = beginSetupBatchOperation(plan);
    const view = buildSetupBatchView(plan, { ...operation, targets: [{ ...operation.targets[0], reason: 'provider', cleanupPending: true, pullRequestNumber: 31 }] }, 'result', 1);
    expect(view.targets[0]).toMatchObject({ retainedSecrets: ['PAT'], reason: 'provider', cleanupPending: true, pullRequestUrl: 'https://github.com/acme/repo/pull/31' });
    expect(view.targets[0].permissionProbes?.length).toBeGreaterThan(0);
    assertSetupBatchOperationMatchesPlan(operation, plan);
    expect(() => assertSetupBatchOperationMatchesPlan({ ...operation, operationId: 'other' }, plan)).toThrow('does not match');
    expect(() => beginSetupBatchOperation({ ...plan, targets: [] })).toThrow();
    expect(() => beginSetupBatchOperation({ ...plan, targets: [{ ...plan.targets[0], digest: 'invalid' }] })).toThrow('digest');
  });
});
