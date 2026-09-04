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

export function resolveSetupResourceScope(
    policy: SetupResourceStoragePolicy,
    name: string,
): SetupResourceScope {
    return policy.overrides[name] ?? policy.defaultScope;
}

export function getSetupResourceStoragePolicy(
    configuration: SetupConfiguration,
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

export function resolveSetupResourceTarget(
    configuration: SetupConfiguration,
    kind: SetupResourceKind,
    name: string,
    remote?: SetupRemoteConfiguration,
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
    remote: SetupRemoteConfiguration | undefined,
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
            errors.push(`Organization-level ${kind} storage is only available for organization-owned repositories.`);
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
