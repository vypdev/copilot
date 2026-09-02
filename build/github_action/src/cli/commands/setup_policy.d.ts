import type { GitInfo } from '../../cli_context';
import type { SetupConfiguration, SetupCredentialCollection } from '../../domain/setup';
export interface SetupCommandOptions {
    debug?: boolean;
}
export declare function buildSetupParams(options: SetupCommandOptions, gitInfo: GitInfo, token: string, configuration?: SetupConfiguration, credentials?: SetupCredentialCollection, approvedWorkflowFiles?: readonly string[]): Record<string, unknown> | undefined;
