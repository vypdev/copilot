import type { SetupRemoteConfiguration, SetupVariable } from '../../domain/setup';

/** Compare the semantic GitHub facts used by setup, not object/response ordering. */
export function sameSetupRemoteFacts(left: SetupRemoteConfiguration, right: SetupRemoteConfiguration): boolean {
  const variables = (items: readonly SetupVariable[]): readonly string[] => items
    .map(item => JSON.stringify([item.name, item.value])).sort();
  const normalize = (facts: SetupRemoteConfiguration) => ({
    ownerType: facts.ownerType,
    repositoryId: facts.repositoryId,
    repositoryVisibility: facts.repositoryVisibility,
    repositorySecrets: [...facts.repositorySecrets].sort(),
    repositorySecretsAccess: facts.repositorySecretsAccess,
    organizationSecrets: [...facts.organizationSecrets].sort(),
    repositoryVariables: variables(facts.repositoryVariables),
    repositoryVariablesAccess: facts.repositoryVariablesAccess,
    organizationVariables: variables(facts.organizationVariables),
    organizationAccess: facts.organizationAccess,
    organizationSecretsAccess: facts.organizationSecretsAccess,
    organizationVariablesAccess: facts.organizationVariablesAccess,
    credentialHealthWorkflow: facts.credentialHealthWorkflow,
  });
  return JSON.stringify(normalize(left)) === JSON.stringify(normalize(right));
}
