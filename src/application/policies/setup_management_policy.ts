import type { SetupRemoteConfiguration, SetupResourceScope } from '../../domain/setup';
import type { SetupInstallation, SetupQuickChange } from '../../domain/setup_management';
import type { SetupManagementView } from '../contracts/setup_management_view';
import { redactSensitiveText } from '../../domain/security/sensitive_text';
import { quickSetting, SETUP_QUICK_SETTINGS, validateQuickSetting } from './setup_quick_settings_policy';

export function managementFingerprint(local: SetupInstallation, remote: SetupRemoteConfiguration, variable: string): string {
  return JSON.stringify([local, remote.ownerType, remote.repositoryId, remote.repositoryVariablesAccess,
    remote.organizationVariablesAccess, remote.repositoryVariables.find(item => item.name === variable) ?? null,
    remote.organizationVariables.find(item => item.name === variable) ?? null]);
}

export function buildSetupManagementView(local: SetupInstallation, remote?: SetupRemoteConfiguration, changed = false): SetupManagementView {
  const accessible = Boolean(remote?.repositoryVariablesAccess === 'available'
    && (remote.ownerType === 'User' || remote.ownerType === 'Organization' && remote.organizationVariablesAccess === 'available'));
  const safe = (value: string) => redactSensitiveText(value.slice(0, 4096));
  const referenced = new Set(local.workflows.flatMap(workflow => workflow.inputs.flatMap(input => input.variable ? [input.variable] : [])));
  const settings = SETUP_QUICK_SETTINGS.map(setting => {
    const bindings = local.workflows.flatMap(workflow => workflow.inputs.filter(input => input.name === setting.input)
      .map(input => ({ ...input, environmentScoped: workflow.environmentScoped })));
    const repo = remote?.repositoryVariables.find(item => item.name === setting.variable);
    const org = remote?.organizationVariables.find(item => item.name === setting.variable);
    const stored = accessible ? repo ?? org : undefined;
    const bindingsSafe = bindings.length > 0 && bindings.every(input => input.variable === setting.variable && !input.environmentScoped);
    const fallbacks = [...new Set(bindings.map(input => input.literal ?? input.fallback))];
    const value = stored && bindingsSafe ? stored.value || (fallbacks.length === 1 ? fallbacks[0] : undefined) : bindings.length > 0 && bindings.every(input => !input.variable && !input.unsupported)
      && fallbacks.length === 1 ? fallbacks[0] : accessible && bindingsSafe && fallbacks.length === 1 ? fallbacks[0] : undefined;
    return { id: setting.id, variable: setting.variable, ...(value === undefined ? {} : { value: safe(value) }),
      source: stored && bindingsSafe ? repo ? 'repository' as const : 'organization' as const
        : value !== undefined ? 'workflow' as const : 'unknown' as const,
      editable: accessible && bindingsSafe && !local.unreadable && value !== undefined && safe(value) === value };
  });
  const resources = (scope: SetupResourceScope) => {
    const values = scope === 'repository' ? remote?.repositoryVariables : remote?.organizationVariables;
    return (values ?? []).filter(item => referenced.has(item.name)).map(item => ({ name: item.name, value: safe(item.value), scope,
      shadowed: scope === 'organization' && Boolean(remote?.repositoryVariables.some(repo => repo.name === item.name)) }));
  };
  const secrets = (scope: SetupResourceScope) => (scope === 'repository' ? remote?.repositorySecrets ?? [] : remote?.organizationSecrets ?? [])
    .map(name => ({ name, scope, shadowed: scope === 'organization' && Boolean(remote?.repositorySecrets.includes(name)) }));
  return { status: local.unreadable || local.guidancePresent && !local.workflows.length ? 'incomplete'
    : local.workflows.length ? 'detected' : 'unconfigured', github: !remote ? 'not-connected' : accessible ? 'available' : 'incomplete',
    workflows: local.workflows, settings, variables: [...resources('repository'), ...resources('organization')],
    secrets: [...secrets('repository'), ...secrets('organization')],
    secretInventory: !remote ? 'not-connected' : remote.repositorySecretsAccess === 'available'
      && (remote.ownerType === 'User' || remote.organizationSecretsAccess === 'available') ? 'available' : 'incomplete', changed };
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
