import { type SetupConfigurationOverrides } from '../application/policies/setup_configuration_policy';
/** Loads a non-secret setup override file. JSON and YAML are supported. */
export declare function loadSetupConfigurationOverrides(filePath: string): SetupConfigurationOverrides;
