import type { AgentConfiguration } from '../model/agent';
import type { AgentCliPort } from '../../infrastructure/agents/ports/agent_provider_ports';
export interface ProviderCliExecution {
    configuration: AgentConfiguration;
    prompt: string;
    timeoutMs: number;
    cwd?: string;
    signal?: AbortSignal;
}
/** Provider-neutral CLI adapter. Provider-specific flags belong in future adapters. */
export declare class ProviderCliAdapter {
    private readonly adapters;
    constructor(client: AgentCliPort);
    execute(request: ProviderCliExecution): Promise<string>;
}
