import { type DoAgentOptions } from './do_policy';
export interface DoCommandOptions extends DoAgentOptions {
    prompt?: unknown;
    debug?: boolean;
    output?: unknown;
}
/** Executes the CLI command after Commander has parsed its options. */
export declare function runDoCommand(options: DoCommandOptions): Promise<void>;
