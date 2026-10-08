import type { SetupRemoteConfiguration, SetupResourceScope } from '../../domain/setup';
import type { SetupInstallation, SetupInstalledInput, SetupQuickChange } from '../../domain/setup_management';
import type { SetupManagementView } from '../contracts/setup_management_view';
import { redactSensitiveText } from '../../domain/security/sensitive_text';
import { quickSetting, SETUP_QUICK_SETTINGS, validateQuickSetting } from './setup_quick_settings_policy';

type Setting = typeof SETUP_QUICK_SETTINGS[number];
type Binding = SetupInstalledInput & { environmentScoped: boolean };
type Variable = SetupRemoteConfiguration['repositoryVariables'][number];
const safe = (value: string) => redactSensitiveText(value.slice(0, 4096));

export function managementFingerprint(local: SetupInstallation, remote: SetupRemoteConfiguration, variable: string): string {
  return JSON.stringify([local, remote.ownerType, remote.repositoryId, remote.repositoryVariablesAccess,
    remote.organizationVariablesAccess, remote.repositoryVariables.find(item => item.name === variable) ?? null,
    remote.organizationVariables.find(item => item.name === variable) ?? null]);
}

function variablesAccessible(remote?: SetupRemoteConfiguration): boolean {
  if (remote?.repositoryVariablesAccess !== 'available') return false;
  return remote.ownerType === 'User' || remote.ownerType === 'Organization' && remote.organizationVariablesAccess === 'available';
}

function resolvedValue(bindings: Binding[], bindingsSafe: boolean, stored: Variable | undefined, accessible: boolean): string | undefined {
  const fallbacks = [...new Set(bindings.map(input => input.literal ?? input.fallback))];
  const fallback = fallbacks.length === 1 ? fallbacks[0] : undefined;
  if (stored && bindingsSafe) return stored.value || fallback;
  if (bindings.length > 0 && bindings.every(input => !input.variable && !input.unsupported)) return fallback;
  return accessible && bindingsSafe ? fallback : undefined;
}

function settingSource(stored: Variable | undefined, bindingsSafe: boolean, repository: boolean, value?: string): SetupManagementView['settings'][number]['source'] {
  if (stored && bindingsSafe) return repository ? 'repository' : 'organization';
  return value === undefined ? 'unknown' : 'workflow';
}

function settingView(local: SetupInstallation, remote: SetupRemoteConfiguration | undefined, setting: Setting, accessible: boolean): SetupManagementView['settings'][number] {
  const bindings = local.workflows.flatMap(workflow => workflow.inputs.filter(input => input.name === setting.input)
    .map(input => ({ ...input, environmentScoped: workflow.environmentScoped })));
  const repository = remote?.repositoryVariables.find(item => item.name === setting.variable);
  const organization = remote?.organizationVariables.find(item => item.name === setting.variable);
  const stored = accessible ? repository ?? organization : undefined;
  const bindingsSafe = bindings.length > 0 && bindings.every(input => input.variable === setting.variable && !input.environmentScoped);
  const value = resolvedValue(bindings, bindingsSafe, stored, accessible);
  const editable = accessible && bindingsSafe && !local.unreadable && value !== undefined && safe(value) === value;
  return { id: setting.id, variable: setting.variable, ...(value === undefined ? {} : { value: safe(value) }),
    source: settingSource(stored, bindingsSafe, Boolean(repository), value), editable };
}

function variableInventory(local: SetupInstallation, remote?: SetupRemoteConfiguration): SetupManagementView['variables'] {
  const referenced = new Set(local.workflows.flatMap(workflow => workflow.inputs.flatMap(input => input.variable ? [input.variable] : [])));
  const repository = remote?.repositoryVariables ?? [];
  const organization = remote?.organizationVariables ?? [];
  const entries = (values: readonly Variable[], scope: SetupResourceScope) => values.filter(item => referenced.has(item.name))
    .map(item => ({ name: item.name, value: safe(item.value), scope,
      shadowed: scope === 'organization' && repository.some(repo => repo.name === item.name) }));
  return [...entries(repository, 'repository'), ...entries(organization, 'organization')];
}

function secretInventory(remote?: SetupRemoteConfiguration): SetupManagementView['secrets'] {
  const repository = remote?.repositorySecrets ?? [];
  const organization = remote?.organizationSecrets ?? [];
  return [...repository.map(name => ({ name, scope: 'repository' as const, shadowed: false })),
    ...organization.map(name => ({ name, scope: 'organization' as const, shadowed: repository.includes(name) }))];
}

function secretAccess(remote?: SetupRemoteConfiguration): SetupManagementView['secretInventory'] {
  if (!remote) return 'not-connected';
  if (remote.repositorySecretsAccess !== 'available') return 'incomplete';
  return remote.ownerType === 'User' || remote.ownerType === 'Organization' && remote.organizationSecretsAccess === 'available' ? 'available' : 'incomplete';
}

function installationStatus(local: SetupInstallation): SetupManagementView['status'] {
  if (local.unreadable || local.guidancePresent && !local.workflows.length) return 'incomplete';
  return local.workflows.length ? 'detected' : 'unconfigured';
}

export function buildSetupManagementView(local: SetupInstallation, remote?: SetupRemoteConfiguration, changed = false): SetupManagementView {
  const accessible = variablesAccessible(remote);
  return { status: installationStatus(local), github: !remote ? 'not-connected' : accessible ? 'available' : 'incomplete',
    workflows: local.workflows, settings: SETUP_QUICK_SETTINGS.map(setting => settingView(local, remote, setting, accessible)),
    variables: variableInventory(local, remote), secrets: secretInventory(remote), secretInventory: secretAccess(remote), changed };
}

/** The effective scope stays fixed; a quick change cannot create a shadow or move resources. */
export function planQuickChange(local: SetupInstallation, remote: SetupRemoteConfiguration, id: string, raw: string): SetupQuickChange | undefined {
  const setting = quickSetting(id);
  const after = validateQuickSetting(id, raw);
  const current = buildSetupManagementView(local, remote).settings.find(item => item.id === id);
  if (!setting || after === undefined || !current?.editable || current.value === undefined) return undefined;
  const scope = current.source === 'organization' ? 'organization' : 'repository';
  return { id, variable: setting.variable, before: current.value, after, scope,
    fingerprint: managementFingerprint(local, remote, setting.variable) };
}
