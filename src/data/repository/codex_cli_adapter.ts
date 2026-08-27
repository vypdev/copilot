import type { AgentConfiguration } from '../model/agent';
import { ProviderCliAdapter, type ProviderCliExecution } from './provider_cli_adapter';
import { AgentCliClient } from './agent_cli_client';

export class CodexCliAdapter {
    constructor(private readonly delegate: ProviderCliAdapter = new ProviderCliAdapter(new AgentCliClient())) {}

    execute(request: ProviderCliExecution): Promise<string> {
        assertCodexConfiguration(request.configuration);
        return this.delegate.execute(request);
    }
}

export function assertCodexConfiguration(configuration: AgentConfiguration): void {
    if (configuration.provider !== 'codex') throw new Error(`Codex adapter received ${configuration.provider} configuration.`);
    if (!configuration.command?.trim()) throw new Error('Codex CLI command is required.');
}
