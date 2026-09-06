import type { SetupConfiguration, SetupCredentialRequirement, SetupPlan, SetupVariable } from '../../domain/setup';
export declare function buildSetupPlan(configuration: SetupConfiguration): SetupPlan;
/** Builds the non-sensitive credential contract implied by the enabled workflows. */
export declare function buildSetupCredentialRequirements(configuration: SetupConfiguration): SetupCredentialRequirement[];
export declare function buildSetupRepositoryVariables(configuration: SetupConfiguration): SetupVariable[];
export declare function buildSetupActionInputs(configuration: SetupConfiguration): Record<string, string>;
