import type { SetupConfiguration, SetupRemoteConfiguration } from '../../domain/setup';
import type { SetupBatchSharedResource, SetupBatchTarget } from '../../domain/setup_batch';
import { setupSharedResourceApplies } from './setup_batch_policy';
import { selectedExistingSetupCredentials, runnerAuthenticationCanSatisfyGroup } from './setup_credential_binding_policy';
import { buildSetupCredentialRequirements } from './setup_credential_requirement_policy';
import { planSetupOrganizationVariableReuse, buildSetupOrganizationReuseVariables } from './setup_organization_variable_reuse_policy';

export function projectSetupBatchSharedBindings(remote: SetupRemoteConfiguration, resources: readonly SetupBatchSharedResource[], target: SetupBatchTarget): SetupRemoteConfiguration {
  const usable = resources.filter(resource => setupSharedResourceApplies(resource, target) || resource.visibility === 'selected');
  return { ...remote,
    organizationVariables: usable.filter(resource => resource.kind === 'variable' && resource.value !== undefined).map(resource => ({ name: resource.name, value: resource.value! })),
    organizationSecrets: usable.filter(resource => resource.kind === 'secret').map(resource => resource.name),
    organizationSecretRevisions: usable.filter(resource => resource.kind === 'secret')
      .map(resource => ({ name: resource.name, updatedAt: resource.updatedAt })) };
}
export function planSetupBatchSharedAccess(configuration: SetupConfiguration, target: SetupBatchTarget,
  remote: SetupRemoteConfiguration, shared: readonly SetupBatchSharedResource[]) {
  const projected = projectSetupBatchSharedBindings(remote, shared.filter(resource => resource.kind !== 'secret'
    || configuration.manageRepositorySecrets || setupSharedResourceApplies(resource, target)), target);
  const variables = configuration.manageRepositoryVariables
    ? planSetupOrganizationVariableReuse(buildSetupOrganizationReuseVariables(configuration, projected), projected)
    : { retained: [], repositoryWrites: [] };
  const requirements = buildSetupCredentialRequirements(configuration);
  const selected = selectedExistingSetupCredentials(requirements, projected);
  const selectedNames = new Set(selected.map(requirement => requirement.name));
  const retainedVariables = new Set(variables.retained.filter(binding => binding.scope === 'organization').map(binding => binding.name));
  // Projection exposes candidate names, not effective scope. Repository Secrets
  // win in credential collection and exclude both shared snapshots and grants.
  const relevant = shared.filter(resource => resource.kind === 'variable' ? retainedVariables.has(resource.name)
    : selectedNames.has(resource.name) && !remote.repositorySecrets.includes(resource.name));
  const grants = relevant.filter(resource => {
    if (setupSharedResourceApplies(resource, target) || resource.visibility !== 'selected'
      || resource.kind === 'secret' && !configuration.manageRepositorySecrets) return false;
    return resource.kind === 'variable' ? retainedVariables.has(resource.name) : !remote.repositorySecrets.includes(resource.name);
  }).map(resource => ({ kind: resource.kind, name: resource.name, repositoryId: target.id }));
  const missing = requirements.filter(requirement => !requirement.alternativeGroups?.length
    && !selectedNames.has(requirement.name)).map(requirement => requirement.name);
  const satisfiedGroups = new Set(selected.flatMap(requirement => requirement.alternativeGroups ?? []));
  for (const group of new Set(requirements.flatMap(requirement => requirement.alternativeGroups ?? []))) {
    if (!satisfiedGroups.has(group) && !runnerAuthenticationCanSatisfyGroup(requirements, group)) missing.push(group);
  }
  return { projected, variables, grants, sharedSnapshot: relevant, selectedSecrets: selected.map(requirement => requirement.name), missing };
}
