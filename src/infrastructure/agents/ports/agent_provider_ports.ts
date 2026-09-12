import type { AgentCapability, AgentConfiguration } from '../../../domain/agent';

export interface AgentCliPort {
    execute(request: {
        configuration: AgentConfiguration;
        capability: AgentCapability;
        prompt: string;
        environment?: NodeJS.ProcessEnv;
        timeoutMs: number;
        signal?: AbortSignal;
        cwd?: string;
        maxOutputBytes?: number;
        maxPromptBytes?: number;
        outputSchema?: Record<string, unknown>;
    }): Promise<string>;
}
