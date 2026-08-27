import type { AgentConfiguration } from '../model/agent';
import { ProviderCliAdapter, type ProviderCliExecution } from './provider_cli_adapter';
import { AgentCliClient } from './agent_cli_client';

export class CursorCliAdapter {
    constructor(private readonly delegate: ProviderCliAdapter = new ProviderCliAdapter(new AgentCliClient())) {}

    execute(request: ProviderCliExecution): Promise<string> {
        assertCursorConfiguration(request.configuration);
        return this.delegate.execute(request);
    }
}

export function assertCursorConfiguration(configuration: AgentConfiguration): void {
    if (configuration.provider !== 'cursor') throw new Error(`Cursor adapter received ${configuration.provider} configuration.`);
    if (!configuration.command?.trim()) throw new Error('Cursor CLI command is required.');
}
