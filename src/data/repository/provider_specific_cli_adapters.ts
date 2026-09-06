import type { AgentCapability, AgentConfiguration, AgentProvider } from '../model/agent';
import type { AgentCliPort } from '../../infrastructure/agents/ports/agent_provider_ports';

export interface ProviderCliRequest {
    configuration: AgentConfiguration;
    prompt: string;
    timeoutMs: number;
    cwd?: string;
    signal?: AbortSignal;
    capability: AgentCapability;
}

abstract class SpecificCliAdapter {
    protected constructor(
        private readonly expectedProvider: AgentProvider,
        protected readonly client: AgentCliPort,
    ) {}

    protected execute(request: ProviderCliRequest): Promise<string> {
        if (request.configuration.provider !== this.expectedProvider) {
            throw new Error(`${this.expectedProvider} CLI adapter received ${request.configuration.provider} configuration.`);
        }
        const command = request.configuration.command?.trim();
        if (!command) throw new Error(`CLI command is required for ${this.expectedProvider}.`);
        return this.client.execute({
            command,
            prompt: request.prompt,
            provider: this.expectedProvider,
            capability: request.capability,
            ...(request.configuration.modelProvider ? { modelProvider: request.configuration.modelProvider } : {}),
            promptMode: this.expectedProvider === 'codex' ? 'stdin' : 'argv',
            timeoutMs: request.timeoutMs,
            cwd: request.cwd,
            signal: request.signal,
        });
    }
}

export class OpenCodeCliAdapter extends SpecificCliAdapter {
    constructor(client: AgentCliPort) { super('opencode', client); }
    execute(request: ProviderCliRequest): Promise<string> { return super.execute(request); }
}

export class CodexCliAdapter extends SpecificCliAdapter {
    constructor(client: AgentCliPort) { super('codex', client); }
    execute(request: ProviderCliRequest): Promise<string> { return super.execute(request); }
}

export class CursorCliAdapter extends SpecificCliAdapter {
    constructor(client: AgentCliPort) { super('cursor', client); }
    execute(request: ProviderCliRequest): Promise<string> { return super.execute(request); }
}
