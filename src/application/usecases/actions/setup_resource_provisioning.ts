import type {
    SetupConfiguration,
    SetupCredentialCollection,
    SetupRemoteConfiguration,
    SetupResourceTarget,
} from '../../../domain/setup';
import {
    buildSetupRepositoryVariables,
    resolveSetupResourceTarget,
    shouldUpsertSetupResource,
    usesOrganizationStorage,
} from '../../policies/setup_configuration_policy';
import type {
    SetupRemoteConfigurationReadPort,
    SetupRepositorySecretsPort,
    SetupRepositoryVariablesPort,
} from '../../ports/setup_wizard_ports';
import { logError } from '../../ports/logging_ports';

export interface SetupResourceProvisioningDependencies {
    setupRepositoryVariablesPort?: SetupRepositoryVariablesPort;
    setupRepositorySecretsPort?: SetupRepositorySecretsPort;
    setupRemoteConfigurationReadPort?: SetupRemoteConfigurationReadPort;
}

export interface SetupRepositoryContext {
    owner: string;
    repo: string;
    token: string;
    setupCredentials?: SetupCredentialCollection;
    setupRemoteConfiguration?: SetupRemoteConfiguration;
}

export type SetupResource = { name: string; value: string };
export type SetupResourceGroup = { target: SetupResourceTarget; resources: SetupResource[] };

export async function ensureRepositoryVariables(
    context: SetupRepositoryContext,
    dependencies: SetupResourceProvisioningDependencies,
    setupConfiguration?: SetupConfiguration,
    remoteConfiguration?: SetupRemoteConfiguration,
): Promise<{ step?: string; errors: string[] }> {
    if (!setupConfiguration?.manageRepositoryVariables || !dependencies.setupRepositoryVariablesPort) {
        return { errors: [] };
    }
    try {
        const desired = buildSetupRepositoryVariables(setupConfiguration);
        const groups = groupSetupResources(desired, 'variable', setupConfiguration, remoteConfiguration);
        const result = await upsertVariableGroups(context, dependencies.setupRepositoryVariablesPort, groups);
        if (result.errors.length > 0) return { errors: result.errors };
        return {
            step: `✅ GitHub Actions Variables: ${result.created} created, ${result.updated} updated; existing effective values preserved when no override was selected.`,
            errors: [],
        };
    } catch (error) {
        const message = `Error configuring repository Variables: ${error}`;
        logError(message);
        return { errors: [message] };
    }
}

export async function ensureRepositorySecrets(
    context: SetupRepositoryContext,
    dependencies: SetupResourceProvisioningDependencies,
    setupConfiguration?: SetupConfiguration,
    remoteConfiguration?: SetupRemoteConfiguration,
): Promise<{ step?: string; errors: string[] }> {
    if (!setupConfiguration?.manageRepositorySecrets || !dependencies.setupRepositorySecretsPort) {
        return { errors: [] };
    }
    const credentials = context.setupCredentials;
    if (!credentials) {
        return { step: '⚠️  Repository Secrets were not changed: run interactive setup to validate and provide credentials.', errors: [] };
    }
    const values = [
        ...(credentials.workflowPat ? [credentials.workflowPat] : []),
        ...credentials.apiKeys,
    ];
    if (values.length === 0) return { step: '✅ Existing Repository Secrets kept unchanged.', errors: [] };
    try {
        const groups = groupSetupResources(values, 'secret', setupConfiguration, remoteConfiguration);
        const result = await upsertSecretGroups(context, dependencies.setupRepositorySecretsPort, groups);
        if (result.errors.length > 0) return { errors: result.errors };
        return {
            step: `✅ GitHub Actions Secrets: ${result.created} created, ${result.updated} updated; existing effective values kept when no replacement was selected.`,
            errors: [],
        };
    } catch (error) {
        const message = `Error configuring repository Secrets: ${error}`;
        logError(message);
        return { errors: [message] };
    }
}

export async function resolveRemoteConfiguration(
    context: SetupRepositoryContext,
    dependencies: SetupResourceProvisioningDependencies,
    setupConfiguration: SetupConfiguration | undefined,
    errors: string[],
): Promise<SetupRemoteConfiguration | undefined> {
    if (context.setupRemoteConfiguration) return context.setupRemoteConfiguration;
    if (!dependencies.setupRemoteConfigurationReadPort || !setupConfiguration) return undefined;
    try {
        return await dependencies.setupRemoteConfigurationReadPort.inspect(context.owner, context.repo, context.token);
    } catch (error) {
        const message = `Could not inspect existing GitHub Actions resource scopes: ${error instanceof Error ? error.message : String(error)}`;
        logError(message);
        if (usesOrganizationStorage(setupConfiguration)) errors.push(message);
        return undefined;
    }
}

/** Groups resources by their resolved storage target so each provider call is scoped explicitly. */
export function groupSetupResources(
    resources: readonly SetupResource[],
    kind: 'secret' | 'variable',
    configuration: SetupConfiguration,
    remoteConfiguration?: SetupRemoteConfiguration,
): SetupResourceGroup[] {
    const groups = new Map<string, SetupResourceGroup>();
    for (const resource of resources) {
        // Secret values reach this workflow only after the user chose keep/replace.
        // Variables are generated from the selected setup contract, so preserving
        // an inherited value must happen before the provider call is assembled.
        if (kind === 'variable' && !shouldUpsertSetupResource(configuration, kind, resource.name, remoteConfiguration)) continue;
        const target = resolveSetupResourceTarget(configuration, kind, resource.name, remoteConfiguration);
        const key = `${target.scope}:${target.organizationVisibility}:${target.repositoryId ?? ''}`;
        const group = groups.get(key) ?? { target, resources: [] };
        group.resources.push(resource);
        groups.set(key, group);
    }
    return [...groups.values()];
}

async function upsertVariableGroups(
    context: SetupRepositoryContext,
    port: SetupRepositoryVariablesPort,
    groups: readonly SetupResourceGroup[],
): Promise<{ created: number; updated: number; errors: string[] }> {
    let created = 0;
    let updated = 0;
    const errors: string[] = [];
    for (const group of groups) {
        if (group.target.scope === 'organization' && !port.upsertScopedVariables) {
            errors.push('Organization Variable provisioning is not available in this installation.');
            continue;
        }
        const result = group.target.scope === 'organization'
            ? await port.upsertScopedVariables!(context.owner, context.repo, context.token, group.target, group.resources)
            : await port.upsert(context.owner, context.repo, context.token, group.resources);
        created += result.created;
        updated += result.updated;
        errors.push(...result.errors);
    }
    return { created, updated, errors };
}

async function upsertSecretGroups(
    context: SetupRepositoryContext,
    port: SetupRepositorySecretsPort,
    groups: readonly SetupResourceGroup[],
): Promise<{ created: number; updated: number; skipped: number; errors: string[] }> {
    let created = 0;
    let updated = 0;
    let skipped = 0;
    const errors: string[] = [];
    for (const group of groups) {
        if (group.target.scope === 'organization' && !port.upsertScopedSecrets) {
            errors.push('Organization Secret provisioning is not available in this installation.');
            continue;
        }
        const result = group.target.scope === 'organization'
            ? await port.upsertScopedSecrets!(context.owner, context.repo, context.token, group.target, group.resources)
            : await port.upsertSecrets(context.owner, context.repo, context.token, group.resources);
        created += result.created;
        updated += result.updated;
        skipped += result.skipped;
        errors.push(...result.errors);
    }
    return { created, updated, skipped, errors };
}
