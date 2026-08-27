import type { AgentConfiguration, AgentProvider } from '../model/agent';
import type { AgentCliPort } from '../../infrastructure/agents/ports/agent_provider_ports';
export interface ProviderCliRequest {
    configuration: AgentConfiguration;
    prompt: string;
    timeoutMs: number;
    cwd?: string;
    signal?: AbortSignal;
}
declare abstract class SpecificCliAdapter {
    private readonly expectedProvider;
    protected readonly client: AgentCliPort;
    protected constructor(expectedProvider: AgentProvider, client: AgentCliPort);
    protected execute(request: ProviderCliRequest): Promise<string>;
}
export declare class OpenCodeCliAdapter extends SpecificCliAdapter {
    constructor(client: AgentCliPort);
    execute(request: ProviderCliRequest): Promise<string>;
}
export declare class CodexCliAdapter extends SpecificCliAdapter {
    constructor(client: AgentCliPort);
    execute(request: ProviderCliRequest): Promise<string>;
}
export declare class CursorCliAdapter extends SpecificCliAdapter {
    constructor(client: AgentCliPort);
    execute(request: ProviderCliRequest): Promise<string>;
}
export {};
