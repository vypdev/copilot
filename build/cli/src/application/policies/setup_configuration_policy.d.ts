import type { AgentTask } from '../../domain/agent';
import type { SetupAgentRoleConfiguration, SetupConfiguration, SetupFeatures, SetupPlan, SetupVariable, SetupCredentialRequirement, SetupResourceScope, SetupResourceStoragePolicy, SetupStorageConfiguration, SetupRemoteConfiguration, SetupResourceTarget } from '../../domain/setup';
export declare const SETUP_AGENT_TASKS: readonly AgentTask[];
export declare const SETUP_FEATURE_DESCRIPTIONS: Readonly<Record<string, string>>;
export declare function createDefaultSetupStorageConfiguration(): SetupStorageConfiguration;
export declare function createDefaultSetupConfiguration(): SetupConfiguration;
export type SetupConfigurationOverrides = {
    features?: Partial<SetupFeatures>;
    agents?: Partial<Record<AgentTask, Partial<SetupAgentRoleConfiguration>>>;
    repository?: Partial<SetupConfiguration['repository']>;
    ai?: Partial<SetupConfiguration['ai']>;
    projects?: Partial<SetupConfiguration['projects']>;
    createInitialTag?: boolean;
    manageRepositoryVariables?: boolean;
    manageRepositorySecrets?: boolean;
    actionInputs?: Record<string, string>;
    storage?: {
        secrets?: Partial<SetupResourceStoragePolicy>;
        variables?: Partial<SetupResourceStoragePolicy>;
    };
};
export declare function mergeSetupConfiguration(base: SetupConfiguration, overrides?: SetupConfigurationOverrides): SetupConfiguration;
export declare function validateSetupConfiguration(configuration: SetupConfiguration): string[];
export declare function buildSetupPlan(configuration: SetupConfiguration): SetupPlan;
/** Builds the non-sensitive credential contract implied by the selected agents. */
export declare function buildSetupCredentialRequirements(configuration: SetupConfiguration): SetupCredentialRequirement[];
export declare function buildSetupRepositoryVariables(configuration: SetupConfiguration): SetupVariable[];
export declare function buildSetupActionInputs(configuration: SetupConfiguration): Record<string, string>;
export declare function resolveSetupResourceScope(policy: SetupResourceStoragePolicy, name: string): SetupResourceScope;
export type SetupResourceKind = 'secret' | 'variable';
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
