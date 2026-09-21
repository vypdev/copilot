import type {
    SetupConfiguration,
    SetupRemoteConfiguration,
    SetupResourceScope,
    SetupResourceStoragePolicy,
    SetupResourceTarget,
    SetupStorageConfiguration,
} from '../../domain/setup';
import { createDefaultSetupStorageConfiguration } from './setup_configuration_defaults';

export type SetupResourceKind = 'secret' | 'variable';

export interface SetupManagedResourceNames {
    secrets: readonly string[];
    variables: readonly string[];
}

export function resolveSetupResourceScope(
    policy: SetupResourceStoragePolicy,
    name: string,
): SetupResourceScope {
    return policy.overrides[name] ?? policy.defaultScope;
}

/**
 * Decides whether an existing managed resource may satisfy credential
 * collection without supplying its value again. An omitted policy preserves
 * the legacy caller contract; an explicit policy must preserve the exact
 * effective scope rather than silently moving or replacing the resource.
 */
export function canKeepExistingSetupResource(
    policy: Readonly<SetupResourceStoragePolicy> | undefined,
    name: string,
    existingScope: SetupResourceScope | undefined,
): boolean {
    if (!existingScope) return false;
    if (!policy) return true;
    if (!policy.preserveExisting) return false;
    const override = Object.prototype.hasOwnProperty.call(policy.overrides, name)
        ? policy.overrides[name]
        : undefined;
    return override === undefined || override === existingScope;
}

export function getSetupResourceStoragePolicy(
    configuration: Readonly<SetupConfiguration>,
    kind: SetupResourceKind,
): SetupResourceStoragePolicy {
    return getSetupStorageConfiguration(configuration)[kind === 'secret' ? 'secrets' : 'variables'];
}

export function getSetupStorageConfiguration(
    configuration: Pick<SetupConfiguration, 'storage'>,
): SetupStorageConfiguration {
    const fallback = createDefaultSetupStorageConfiguration();
    return {
        secrets: mergeStoragePolicy(fallback.secrets, configuration.storage?.secrets),
        variables: mergeStoragePolicy(fallback.variables, configuration.storage?.variables),
    };
}

/**
 * Repository inventory is needed only when a selected resource can target the
 * repository or when preserving an unoverridden resource requires discovering
 * whether it already exists there.
 */
export function requiresSetupRepositoryInventory(
    policy: Readonly<SetupResourceStoragePolicy>,
    names: readonly string[],
): boolean {
    return names.some(name => {
        if (Object.prototype.hasOwnProperty.call(policy.overrides, name)) {
            return policy.overrides[name] === 'repository';
        }
        return policy.defaultScope === 'repository' || policy.preserveExisting;
    });
}

/**
 * Organization inventory is needed when a selected resource can target the
 * organization or when preservation must discover an unoverridden resource
 * there before falling back to its configured default scope.
 */
export function requiresSetupOrganizationInventory(
    policy: Readonly<SetupResourceStoragePolicy>,
    names: readonly string[],
    repositoryExistingNames: readonly string[] = [],
): boolean {
    const repositoryExisting = new Set(repositoryExistingNames);
    return names.some(name => {
        if (Object.prototype.hasOwnProperty.call(policy.overrides, name)) {
            return policy.overrides[name] === 'organization';
        }
        if (policy.preserveExisting && repositoryExisting.has(name)) return false;
        return policy.defaultScope === 'organization' || policy.preserveExisting;
    });
}

export function resolveSetupResourceTarget(
    configuration: Readonly<SetupConfiguration>,
    kind: SetupResourceKind,
    name: string,
    remote?: Readonly<SetupRemoteConfiguration>,
): SetupResourceTarget {
    const policy = getSetupResourceStoragePolicy(configuration, kind);
    const explicitOverride = Object.prototype.hasOwnProperty.call(policy.overrides, name);
    const existingScope = setupResourceExists(remote, kind, name).effective;
    const scope = existingScope && policy.preserveExisting && !explicitOverride
        ? existingScope
        : resolveSetupResourceScope(policy, name);
    return {
        scope,
        organizationVisibility: policy.organizationVisibility,
        repositoryId: remote?.repositoryId,
    };
}

export function setupResourceExists(
    remote: Readonly<SetupRemoteConfiguration> | undefined,
    kind: SetupResourceKind,
    name: string,
): { repository: boolean; organization: boolean; effective?: SetupResourceScope } {
    if (!remote) return { repository: false, organization: false };
    const repository = kind === 'secret'
        ? remote.repositorySecrets.includes(name)
        : remote.repositoryVariables.some(variable => variable.name === name);
    const organizationAccess = kind === 'secret'
        ? (remote.organizationSecretsAccess ?? remote.organizationAccess)
        : (remote.organizationVariablesAccess ?? remote.organizationAccess);
    const organization = organizationAccess === 'available' && (kind === 'secret'
        ? remote.organizationSecrets.includes(name)
        : remote.organizationVariables.some(variable => variable.name === name));
    return {
        repository,
        organization,
        effective: repository ? 'repository' : organization ? 'organization' : undefined,
    };
}

export function shouldUpsertSetupResource(
    configuration: SetupConfiguration,
    kind: SetupResourceKind,
    name: string,
    remote?: SetupRemoteConfiguration,
): boolean {
    const policy = getSetupResourceStoragePolicy(configuration, kind);
    const state = setupResourceExists(remote, kind, name);
    if (!state.effective) return true;
    const requested = resolveSetupResourceScope(policy, name);
    const explicitOverride = Object.prototype.hasOwnProperty.call(policy.overrides, name);
    return requested === state.effective || explicitOverride || !policy.preserveExisting;
}

export function validateSetupStorageAgainstRemote(
    configuration: SetupConfiguration,
    remote: SetupRemoteConfiguration,
): string[] {
    const errors: string[] = [];
    const policies: Array<[SetupResourceKind, SetupResourceStoragePolicy, boolean]> = [
        ['secret', getSetupResourceStoragePolicy(configuration, 'secret'), configuration.manageRepositorySecrets],
        ['variable', getSetupResourceStoragePolicy(configuration, 'variable'), configuration.manageRepositoryVariables],
    ];
    for (const [kind, policy, managed] of policies) {
        if (!managed) continue;
        const needsOrganization = policy.defaultScope === 'organization'
            || Object.values(policy.overrides).includes('organization');
        if (!needsOrganization) continue;
        if (remote.ownerType !== 'Organization') {
            errors.push(remote.ownerType === 'Unknown'
                ? `Repository ownership is unavailable; retry remote inspection before selecting organization ${kind} storage.`
                : `Organization-level ${kind} storage is only available for organization-owned repositories.`);
            continue;
        }
        const access = kind === 'secret' ? remote.organizationSecretsAccess : remote.organizationVariablesAccess;
        if (access !== 'available') {
            errors.push(`The setup PAT cannot inspect organization ${kind}s for this repository. Organization ${kind} permissions are required.`);
        }
        if (policy.organizationVisibility === 'selected' && remote.repositoryId === undefined) {
            errors.push(`The repository ID is required for selected organization ${kind} access.`);
        }
    }
    return errors;
}

/**
 * Prevents unavailable repository inventory from being interpreted as an
 * authoritative empty list after the final permission report has been shown.
 */
export function validateSetupManagedResourceInventory(
    configuration: SetupConfiguration,
    remote: SetupRemoteConfiguration,
    resources: Readonly<SetupManagedResourceNames>,
): string[] {
    const errors: string[] = [];
    const secretsRequireRepositoryInventory = configuration.manageRepositorySecrets
        && requiresSetupRepositoryInventory(
            getSetupResourceStoragePolicy(configuration, 'secret'),
            resources.secrets,
        );
    const variablesRequireRepositoryInventory = configuration.manageRepositoryVariables
        && requiresSetupRepositoryInventory(
            getSetupResourceStoragePolicy(configuration, 'variable'),
            resources.variables,
        );
    const secretsRequireOrganizationInventory = remote.ownerType === 'Organization'
        && configuration.manageRepositorySecrets
        && requiresSetupOrganizationInventory(
            getSetupResourceStoragePolicy(configuration, 'secret'),
            resources.secrets,
            remote.repositorySecrets,
        );
    const variablesRequireOrganizationInventory = remote.ownerType === 'Organization'
        && configuration.manageRepositoryVariables
        && requiresSetupOrganizationInventory(
            getSetupResourceStoragePolicy(configuration, 'variable'),
            resources.variables,
            remote.repositoryVariables.map(variable => variable.name),
        );
    if (secretsRequireRepositoryInventory && remote.repositorySecretsAccess !== 'available') {
        errors.push(`Repository Secret inventory is ${remote.repositorySecretsAccess}; setup cannot safely decide whether to preserve or replace existing Secrets.`);
    }
    if (variablesRequireRepositoryInventory && remote.repositoryVariablesAccess !== 'available') {
        errors.push(`Repository Variable inventory is ${remote.repositoryVariablesAccess}; setup cannot safely preserve existing Variable scopes and values.`);
    }
    if (secretsRequireOrganizationInventory && remote.organizationSecretsAccess !== 'available') {
        errors.push(`Organization Secret inventory is ${remote.organizationSecretsAccess}; setup cannot safely decide whether to preserve or replace existing Secrets.`);
    }
    if (variablesRequireOrganizationInventory && remote.organizationVariablesAccess !== 'available') {
        errors.push(`Organization Variable inventory is ${remote.organizationVariablesAccess}; setup cannot safely preserve existing Variable scopes and values.`);
    }
    return errors;
}

export function usesOrganizationStorage(configuration: SetupConfiguration): boolean {
    const storage = getSetupStorageConfiguration(configuration);
    return [storage.secrets, storage.variables].some(policy =>
        policy.defaultScope === 'organization' || Object.values(policy.overrides).includes('organization'),
    );
}

export function validateStorageConfiguration(storage: SetupStorageConfiguration | undefined): string[] {
    if (!storage) return [];
    const errors: string[] = [];
    for (const [kind, policy] of Object.entries(storage)) {
        if (!policy || !['repository', 'organization'].includes(policy.defaultScope)) {
            errors.push(`${kind} default scope must be repository or organization.`);
            continue;
        }
        if (!['all', 'private', 'selected'].includes(policy.organizationVisibility)) {
            errors.push(`${kind} organization visibility must be all, private, or selected.`);
        }
        if (typeof policy.preserveExisting !== 'boolean') errors.push(`${kind} preserveExisting must be a boolean.`);
        for (const [name, scope] of Object.entries(policy.overrides ?? {}) as [string, SetupResourceScope][]) {
            if (!/^[A-Z][A-Z0-9_]*$/.test(name)) errors.push(`${kind} override name ${name} must be an uppercase GitHub Actions name.`);
            if (!['repository', 'organization'].includes(scope)) errors.push(`${kind} override ${name} must use repository or organization.`);
        }
    }
    return errors;
}

function mergeStoragePolicy(
    base: SetupResourceStoragePolicy | undefined,
    override: Partial<SetupResourceStoragePolicy> | undefined,
): SetupResourceStoragePolicy {
    const fallback = base ?? createDefaultSetupStorageConfiguration().secrets;
    return {
        ...fallback,
        ...(override ?? {}),
        overrides: { ...fallback.overrides, ...(override?.overrides ?? {}) },
    };
}
