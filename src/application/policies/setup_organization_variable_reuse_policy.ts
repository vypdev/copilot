import type { SetupConfiguration, SetupRemoteConfiguration, SetupVariable } from '../../domain/setup';
import { buildSetupCredentialRequirements } from './setup_credential_requirement_policy';
import { buildSetupRepositoryVariables } from './setup_configuration_plan';
import { SETUP_ORGANIZATION_VARIABLE_BINDINGS } from './setup_organization_variable_bindings';

/** Nonempty separators are native empty lists, including on older Action versions. */
const emptyLists: Readonly<Record<string, string>> = {
  BUGBOT_AUTOFIX_VERIFY_COMMANDS: ',', PROJECT_IDS: ',', AI_IGNORE_FILES: ',', BUGBOT_ORGANIZATION_RULES: ';',
};

export function normalizeSetupStoredEmptyList(name: string, value: string): string {
  return emptyLists[name] === value ? '' : value;
}

/** GitHub rejects empty Variable values: preserve intentional empty list answers with native delimiters. */
export function buildSetupOrganizationReuseVariables(configuration: SetupConfiguration, remote: SetupRemoteConfiguration): SetupVariable[] {
  const desired = new Map(buildSetupRepositoryVariables(configuration).map(variable => [variable.name, variable]));
  const effective = new Map([...remote.organizationVariables, ...remote.repositoryVariables].map(variable => [variable.name.toUpperCase(), variable]));
  for (const binding of SETUP_ORGANIZATION_VARIABLE_BINDINGS) {
    const value = binding.path.split('.').reduce<unknown>((current, key) => (current as Record<string, unknown>)[key], configuration);
    if (value !== '' && value !== undefined || desired.has(binding.variable)) continue;
    const existing = effective.get(binding.variable) ?? (binding.fallbackVariable ? effective.get(binding.fallbackVariable) : undefined);
    if (!existing?.value.trim()) continue;
    const emptyList = emptyLists[binding.variable];
    if (emptyList) desired.set(binding.variable, { name: binding.variable, value: emptyList });
    else if (!binding.path.startsWith('projects.') || configuration.projects.ids) {
      throw new Error(`${binding.variable} has an inherited nonempty value. Choose an explicit target value; GitHub cannot store an empty override for this scalar setting.`);
    }
  }
  return [...desired.values()];
}

export interface SetupReusedVariablePlan {
  readonly retained: readonly { readonly name: string; readonly scope: 'repository' | 'organization' }[];
  /** New or explicitly reviewed target values belong to this repository. Shared values are immutable. */
  readonly repositoryWrites: readonly SetupVariable[];
}

/** Reuse never invokes an organization value writer, including for a changed imported answer. */
export function planSetupOrganizationVariableReuse(desired: readonly SetupVariable[], remote: SetupRemoteConfiguration): SetupReusedVariablePlan {
  if (remote.ownerType !== 'Organization' || remote.repositoryVariablesAccess !== 'available'
    || remote.organizationVariablesAccess !== 'available') throw new Error('Available organization and repository Variable inventories are required for reuse.');
  const repository = inventory(remote.repositoryVariables);
  const organization = inventory(remote.organizationVariables);
  const retained: { name: string; scope: 'repository' | 'organization' }[] = [];
  const repositoryWrites: SetupVariable[] = [];
  const names = new Set<string>();
  for (const variable of desired) {
    if (!/^[A-Z][A-Z0-9_]*$/u.test(variable.name) || names.has(variable.name)) throw new Error('Invalid or duplicate desired Variable name.');
    names.add(variable.name);
    const effective = repository.get(variable.name) ?? organization.get(variable.name);
    if (effective?.value === variable.value) retained.push({ name: variable.name, scope: repository.has(variable.name) ? 'repository' : 'organization' });
    else repositoryWrites.push({ ...variable });
  }
  return { retained, repositoryWrites };
}

/** Make target overrides visible in the existing plan, audits and storage validation. */
export function configureSetupOrganizationReuseStorage(configuration: SetupConfiguration, desired: readonly SetupVariable[],
  remote: SetupRemoteConfiguration): SetupConfiguration {
  const plan = planSetupOrganizationVariableReuse(desired, remote);
  if (!configuration.storage.variables.preserveExisting || !configuration.storage.secrets.preserveExisting) {
    throw new Error('Organization reuse requires preserving existing Variables and Secrets. Choose Customize to replace shared configuration.');
  }
  const variables = Object.fromEntries([
    ...plan.retained.map(binding => [binding.name, binding.scope]),
    ...plan.repositoryWrites.map(variable => [variable.name, 'repository' as const] as const),
  ]);
  const secrets = { ...configuration.storage.secrets.overrides };
  for (const requirement of buildSetupCredentialRequirements(configuration)) {
    const scope = remote.repositorySecrets.includes(requirement.name) ? 'repository'
      : remote.organizationSecrets.includes(requirement.name) ? 'organization' : undefined;
    if (!scope) continue;
    if (secrets[requirement.name] !== undefined && secrets[requirement.name] !== scope) {
      throw new Error('Reuse cannot move or replace an existing Secret binding. Review the explicit storage override.');
    }
    secrets[requirement.name] = scope;
  }
  return { ...configuration, storage: {
    variables: { ...configuration.storage.variables, overrides: { ...configuration.storage.variables.overrides, ...variables } },
    secrets: { ...configuration.storage.secrets, overrides: { ...configuration.storage.secrets.overrides, ...secrets } },
  } };
}

function inventory(variables: readonly SetupVariable[]): Map<string, SetupVariable> {
  const result = new Map<string, SetupVariable>();
  for (const variable of variables) {
    const name = variable.name.toUpperCase();
    if (!/^[A-Z_][A-Z0-9_]*$/u.test(name) || result.has(name)) throw new Error('Invalid or ambiguous Variable inventory.');
    result.set(name, variable);
  }
  return result;
}
