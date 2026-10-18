import type { SetupCredentialRequirement, SetupRemoteConfiguration } from '../../domain/setup';

export function hasAlternative(requirement: SetupCredentialRequirement): boolean {
    return (requirement.alternativeGroups?.length ?? 0) > 0;
}

export function runnerAuthenticationCanSatisfyRequirement(requirement: SetupCredentialRequirement): boolean {
    return Boolean(requirement.alternativeGroups?.length)
        && requirement.alternativeGroups!.every(group => requirement.runnerAuthenticationGroups?.includes(group));
}

export function runnerAuthenticationCanSatisfyGroup(
    requirements: readonly SetupCredentialRequirement[],
    group: string,
): boolean {
    return requirements.some(requirement => requirement.runnerAuthenticationGroups?.includes(group));
}

export function isRequirementSatisfied(requirement: SetupCredentialRequirement, satisfiedGroups: ReadonlySet<string>): boolean {
    return hasAlternative(requirement)
        ? requirement.alternativeGroups!.every(group => satisfiedGroups.has(group))
        : satisfiedGroups.has(requirement.name);
}

export function markRequirementSatisfied(requirement: SetupCredentialRequirement, satisfiedGroups: Set<string>): void {
    if (hasAlternative(requirement)) {
        for (const group of requirement.alternativeGroups!) satisfiedGroups.add(group);
        return;
    }
    satisfiedGroups.add(requirement.name);
}

/** The same ordered alternative groups used by credential collection select the bindings that need grants. */
export function selectedExistingSetupCredentials(requirements: readonly SetupCredentialRequirement[], remote: SetupRemoteConfiguration): readonly SetupCredentialRequirement[] {
  const groups = new Set<string>(); const selected: SetupCredentialRequirement[] = [];
  for (const requirement of requirements) {
    if (isRequirementSatisfied(requirement, groups)) continue;
    if (!remote.repositorySecrets.includes(requirement.name) && !remote.organizationSecrets.includes(requirement.name)) continue;
    selected.push(requirement); markRequirementSatisfied(requirement, groups);
  }
  return selected;
}
