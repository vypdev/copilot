import type { AgentConfiguration } from '../model/agent';
import type { AgentCliPort } from '../../infrastructure/agents/ports/agent_provider_ports';
import { CodexCliAdapter, CursorCliAdapter, OpenCodeCliAdapter, type ProviderCliRequest } from './provider_specific_cli_adapters';

export interface ProviderCliExecution {
    configuration: AgentConfiguration;
    prompt: string;
    timeoutMs: number;
    cwd?: string;
    signal?: AbortSignal;
}

/** Provider-neutral CLI adapter that delegates provider-specific execution to focused adapters. */
export class ProviderCliAdapter {
    private readonly adapters;

    constructor(client: AgentCliPort) {
        this.adapters = {
            opencode: new OpenCodeCliAdapter(client),
            codex: new CodexCliAdapter(client),
            cursor: new CursorCliAdapter(client),
        };
    }

    execute(request: ProviderCliExecution): Promise<string> {
        const providerRequest: ProviderCliRequest = request;
        return this.adapters[request.configuration.provider].execute(providerRequest);
    }
}
