import type { AgentConfiguration } from '../model/agent';
import { ProviderCliAdapter, type ProviderCliExecution } from './provider_cli_adapter';
export declare class CodexCliAdapter {
    private readonly delegate;
    constructor(delegate?: ProviderCliAdapter);
    execute(request: ProviderCliExecution): Promise<string>;
}
export declare function assertCodexConfiguration(configuration: AgentConfiguration): void;
