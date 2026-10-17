import type { SetupRemoteConfiguration, SetupVariable } from '../../domain/setup';

/** Compare the semantic GitHub facts used by setup, not object/response ordering. */
export function sameSetupRemoteFacts(left: SetupRemoteConfiguration, right: SetupRemoteConfiguration): boolean {
  if (!hasCompleteSetupSecretRevisions(left) || !hasCompleteSetupSecretRevisions(right)) return false;
  const variables = (items: readonly SetupVariable[]): readonly string[] => items
    .map(item => JSON.stringify([item.name, item.value])).sort();
  const normalize = (facts: SetupRemoteConfiguration) => ({
    ownerType: facts.ownerType,
    defaultBranch: facts.defaultBranch,
    repositoryId: facts.repositoryId,
    repositoryVisibility: facts.repositoryVisibility,
    repositorySecrets: [...facts.repositorySecrets].sort(),
    repositorySecretsAccess: facts.repositorySecretsAccess,
    secretRevisions: setupSecretRevisionSnapshot(facts),
    organizationSecrets: [...facts.organizationSecrets].sort(),
    organizationWorkflowPat: facts.organizationWorkflowPat,
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

/** Unknown revisions cannot establish freshness, even when two unknown reads look equal. */
export function hasCompleteSetupSecretRevisions(remote: SetupRemoteConfiguration): boolean {
  const complete = (names: readonly string[], revisions: SetupRemoteConfiguration['repositorySecretRevisions']) => {
    if (names.length === 0) return revisions === undefined || revisions.length === 0;
    if (!revisions || revisions.length !== names.length || new Set(names).size !== names.length
      || revisions.some(secret => typeof secret.name !== 'string' || !Number.isFinite(Date.parse(secret.updatedAt)))) return false;
    return JSON.stringify(revisions.map(secret => secret.name).sort()) === JSON.stringify([...names].sort());
  };
  return complete(remote.repositorySecrets, remote.repositorySecretRevisions)
    && complete(remote.organizationSecrets, remote.organizationSecretRevisions);
}

/** A failed read carries explicit unknown availability; its empty arrays are never absence evidence. */
export function unavailableSetupRemoteConfiguration(): SetupRemoteConfiguration {
  return { ownerType: 'Unknown', repositoryVisibility: 'unknown',
    repositorySecrets: [], repositorySecretsAccess: 'unavailable',
    organizationSecrets: [], organizationSecretsAccess: 'unavailable',
    repositoryVariables: [], repositoryVariablesAccess: 'unavailable',
    organizationVariables: [], organizationVariablesAccess: 'unavailable',
    organizationAccess: 'unavailable', credentialHealthWorkflow: 'unavailable' };
}

/** Stable metadata only: a retained Secret rotation invalidates the reviewed snapshot. */
export function setupSecretRevisionSnapshot(remote: SetupRemoteConfiguration): readonly unknown[] {
  return [remote.repositorySecretRevisions, remote.organizationSecretRevisions]
    .map(revisions => revisions?.map(secret => JSON.stringify([secret.name, secret.updatedAt])).sort());
}
