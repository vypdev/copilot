import type {
    SetupConfiguration,
    SetupCredentialCollection,
    SetupRemoteConfiguration,
    SetupResourceTarget,
} from '../../../domain/setup';
import {
    buildSetupRepositoryVariables,
    findSetupOrganizationShadows,
    getSetupResourceStoragePolicy,
    requiresSetupOrganizationInventory,
    requiresSetupRepositoryInventory,
    resolveSetupResourceTarget,
    shouldUpsertSetupResource,
} from '../../policies/setup_configuration_policy';
import type {
    BoundSetupRemoteConfigurationReadPort,
    BoundSetupRepositorySecretsCommandPort,
    BoundSetupRepositoryVariablesCommandPort,
} from '../../ports/setup_wizard_ports';
import { logError } from '../../ports/logging_ports';
import { ApplicationError, toApplicationError } from '../../errors/application_error';

export interface SetupResourceProvisioningDependencies {
    setupRepositoryVariablesPort?: BoundSetupRepositoryVariablesCommandPort;
    setupRepositorySecretsPort?: BoundSetupRepositorySecretsCommandPort;
    setupRemoteConfigurationReadPort?: BoundSetupRemoteConfigurationReadPort;
}

export interface SetupRepositoryContext {
    setupCredentials?: SetupCredentialCollection;
    setupRemoteConfiguration?: SetupRemoteConfiguration;
}

export type SetupResource = { name: string; value: string };
export type SetupResourceGroup = { target: SetupResourceTarget; resources: SetupResource[] };
export type SetupResourceProvisioningOutcome = { step?: string; errors: string[]; writes: number };

export const VARIABLE_PROVISIONING_UNAVAILABLE = 'GitHub Actions Variable provisioning is unavailable; no Variables were changed.';
export const SECRET_PROVISIONING_UNAVAILABLE = 'GitHub Actions Secret provisioning is unavailable; no Secrets were changed.';

export async function ensureRepositoryVariables(
    context: SetupRepositoryContext,
    dependencies: SetupResourceProvisioningDependencies,
    setupConfiguration?: SetupConfiguration,
    remoteConfiguration?: SetupRemoteConfiguration,
): Promise<SetupResourceProvisioningOutcome> {
    if (!setupConfiguration?.manageRepositoryVariables) {
        return { errors: [], writes: 0 };
    }
    if (!dependencies.setupRepositoryVariablesPort) {
        return { errors: [VARIABLE_PROVISIONING_UNAVAILABLE], writes: 0 };
    }
    try {
        const desired = buildSetupRepositoryVariables(setupConfiguration);
        const groups = groupSetupResources(desired, 'variable', setupConfiguration, remoteConfiguration);
        const result = await upsertVariableGroups(context, dependencies.setupRepositoryVariablesPort, groups);
        const writes = result.created + result.updated;
        if (result.errors.length > 0) return { errors: result.errors, writes };
        return {
            step: writes > 0
                ? `✅ GitHub Actions Variables: ${result.created} created, ${result.updated} updated; existing effective values preserved when no override was selected.`
                : '✅ GitHub Actions Variables kept unchanged; no values were created or updated.',
            errors: [],
            writes,
        };
    } catch (error) {
        const semanticError = toApplicationError(
            error,
            'provider.unavailable',
            'Unable to configure GitHub Actions Variables.',
        );
        logError(semanticError);
        return { errors: [semanticError.message], writes: 0 };
    }
}

export async function ensureRepositorySecrets(
    context: SetupRepositoryContext,
    dependencies: SetupResourceProvisioningDependencies,
    setupConfiguration?: SetupConfiguration,
    remoteConfiguration?: SetupRemoteConfiguration,
): Promise<SetupResourceProvisioningOutcome> {
    if (!setupConfiguration?.manageRepositorySecrets) {
        return { errors: [], writes: 0 };
    }
    const credentials = context.setupCredentials;
    if (!credentials) {
        return { step: '⚠️  Repository Secrets were not changed: run interactive setup to validate and provide credentials.', errors: [], writes: 0 };
    }
    const values = [
        ...(credentials.workflowPat ? [credentials.workflowPat] : []),
        ...credentials.apiKeys,
    ];
    if (values.length === 0) return { step: '✅ Existing Repository Secrets kept unchanged.', errors: [], writes: 0 };
    if (!dependencies.setupRepositorySecretsPort) {
        return { errors: [SECRET_PROVISIONING_UNAVAILABLE], writes: 0 };
    }
    try {
        const groups = groupSetupResources(values, 'secret', setupConfiguration, remoteConfiguration);
        const result = await upsertSecretGroups(context, dependencies.setupRepositorySecretsPort, groups);
        const writes = result.created + result.updated;
        if (result.errors.length > 0) return { errors: result.errors, writes };
        return {
            step: writes > 0
                ? `✅ GitHub Actions Secrets: ${result.created} created, ${result.updated} updated; existing effective values kept when no replacement was selected.`
                : '✅ Existing GitHub Actions Secrets kept unchanged; no values were created or updated.',
            errors: [],
            writes,
        };
    } catch (error) {
        const semanticError = toApplicationError(
            error,
            'provider.unavailable',
            'Unable to configure GitHub Actions Secrets.',
        );
        logError(semanticError);
        return { errors: [semanticError.message], writes: 0 };
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
        return await dependencies.setupRemoteConfigurationReadPort.inspect();
    } catch (error) {
        const semanticError = toApplicationError(
            error,
            'provider.unavailable',
            'Could not inspect existing GitHub Actions resource scopes.',
        );
        logError(semanticError);
        if (setupConfiguration.manageRepositorySecrets || setupConfiguration.manageRepositoryVariables) {
            errors.push(semanticError.message);
        }
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
    if (resources.length > 0 && !remoteConfiguration) {
        throw new ApplicationError(
            'provider.unavailable',
            `GitHub Actions ${kind} inventory is unavailable; resource targets cannot be resolved safely. Restore inventory access and rerun setup.`,
        );
    }
    const repositoryAccess = kind === 'secret'
        ? remoteConfiguration?.repositorySecretsAccess
        : remoteConfiguration?.repositoryVariablesAccess;
    const requiresRepositoryInventory = requiresSetupRepositoryInventory(resources.map(resource => resource.name));
    if (remoteConfiguration && requiresRepositoryInventory && repositoryAccess !== 'available') {
        throw new Error(`Repository ${kind} inventory is ${repositoryAccess}; resource targets cannot be resolved safely.`);
    }
    const organizationAccess = kind === 'secret'
        ? remoteConfiguration?.organizationSecretsAccess
        : remoteConfiguration?.organizationVariablesAccess;
    const requiresOrganizationInventory = remoteConfiguration?.ownerType === 'Organization'
        && requiresSetupOrganizationInventory(
            getSetupResourceStoragePolicy(configuration, kind),
            resources.map(resource => resource.name),
            kind === 'secret'
                ? remoteConfiguration.repositorySecrets
                : remoteConfiguration.repositoryVariables.map(variable => variable.name),
            kind,
        );
    if (requiresOrganizationInventory && organizationAccess !== 'available') {
        throw new Error(`Organization ${kind} inventory is ${organizationAccess}; resource targets cannot be resolved safely.`);
    }
    if (remoteConfiguration && repositoryAccess === 'available') {
        const shadows = findSetupOrganizationShadows(
            getSetupResourceStoragePolicy(configuration, kind), kind,
            resources.map(resource => resource.name), remoteConfiguration,
        );
        if (shadows.length > 0) {
            throw new ApplicationError(
                'configuration.invalid',
                `Repository ${kind} ${shadows[0]} shadows the selected organization target; choose repository scope or remove the shadow before setup.`,
            );
        }
    }
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
    port: BoundSetupRepositoryVariablesCommandPort,
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
            ? await port.upsertScopedVariables!(group.target, group.resources)
            : await port.upsert(group.resources);
        created += result.created;
        updated += result.updated;
        errors.push(...result.errors);
    }
    return { created, updated, errors };
}

async function upsertSecretGroups(
    context: SetupRepositoryContext,
    port: BoundSetupRepositorySecretsCommandPort,
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
            ? await port.upsertScopedSecrets!(group.target, group.resources)
            : await port.upsertSecrets(group.resources);
        created += result.created;
        updated += result.updated;
        skipped += result.skipped;
        errors.push(...result.errors);
    }
    return { created, updated, skipped, errors };
}
