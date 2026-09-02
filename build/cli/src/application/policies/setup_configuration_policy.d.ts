import type { AgentTask } from '../../domain/agent';
import type { SetupAgentRoleConfiguration, SetupConfiguration, SetupFeatures, SetupPlan, SetupVariable, SetupCredentialRequirement } from '../../domain/setup';
export declare const SETUP_AGENT_TASKS: readonly AgentTask[];
export declare const SETUP_FEATURE_DESCRIPTIONS: Readonly<Record<string, string>>;
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
};
export declare function mergeSetupConfiguration(base: SetupConfiguration, overrides?: SetupConfigurationOverrides): SetupConfiguration;
export declare function validateSetupConfiguration(configuration: SetupConfiguration): string[];
export declare function buildSetupPlan(configuration: SetupConfiguration): SetupPlan;
/** Builds the non-sensitive credential contract implied by the selected agents. */
export declare function buildSetupCredentialRequirements(configuration: SetupConfiguration): SetupCredentialRequirement[];
export declare function buildSetupRepositoryVariables(configuration: SetupConfiguration): SetupVariable[];
export declare function buildSetupActionInputs(configuration: SetupConfiguration): Record<string, string>;
