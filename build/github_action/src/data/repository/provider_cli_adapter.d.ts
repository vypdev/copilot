import type { AgentCapability, AgentConfiguration } from '../model/agent';
import type { AgentCliPort } from '../../infrastructure/agents/ports/agent_provider_ports';
export interface ProviderCliExecution {
    configuration: AgentConfiguration;
    prompt: string;
    timeoutMs: number;
    cwd?: string;
    signal?: AbortSignal;
    capability: AgentCapability;
}
/** Provider-neutral CLI adapter that delegates provider-specific execution to focused adapters. */
export declare class ProviderCliAdapter {
    private readonly adapters;
    constructor(client: AgentCliPort);
    execute(request: ProviderCliExecution): Promise<string>;
}
