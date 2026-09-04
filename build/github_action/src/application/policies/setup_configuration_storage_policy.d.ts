import type { SetupConfiguration, SetupRemoteConfiguration, SetupResourceScope, SetupResourceStoragePolicy, SetupResourceTarget, SetupStorageConfiguration } from '../../domain/setup';
export type SetupResourceKind = 'secret' | 'variable';
export declare function resolveSetupResourceScope(policy: SetupResourceStoragePolicy, name: string): SetupResourceScope;
export declare function getSetupResourceStoragePolicy(configuration: SetupConfiguration, kind: SetupResourceKind): SetupResourceStoragePolicy;
export declare function getSetupStorageConfiguration(configuration: Pick<SetupConfiguration, 'storage'>): SetupStorageConfiguration;
export declare function resolveSetupResourceTarget(configuration: SetupConfiguration, kind: SetupResourceKind, name: string, remote?: SetupRemoteConfiguration): SetupResourceTarget;
export declare function setupResourceExists(remote: SetupRemoteConfiguration | undefined, kind: SetupResourceKind, name: string): {
    repository: boolean;
    organization: boolean;
    effective?: SetupResourceScope;
};
export declare function shouldUpsertSetupResource(configuration: SetupConfiguration, kind: SetupResourceKind, name: string, remote?: SetupRemoteConfiguration): boolean;
export declare function validateSetupStorageAgainstRemote(configuration: SetupConfiguration, remote: SetupRemoteConfiguration): string[];
export declare function usesOrganizationStorage(configuration: SetupConfiguration): boolean;
export declare function validateStorageConfiguration(storage: SetupStorageConfiguration | undefined): string[];
