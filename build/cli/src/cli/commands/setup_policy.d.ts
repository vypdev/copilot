import type { GitInfo } from '../../cli_context';
export interface SetupCommandOptions {
    debug?: boolean;
}
export declare function buildSetupParams(options: SetupCommandOptions, gitInfo: GitInfo, token: string): Record<string, unknown> | undefined;
