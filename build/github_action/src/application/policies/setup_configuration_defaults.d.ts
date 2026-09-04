import type { AgentTask } from '../../domain/agent';
import type { SetupAgentRoleConfiguration, SetupConfiguration, SetupFeatures, SetupResourceStoragePolicy, SetupStorageConfiguration } from '../../domain/setup';
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
