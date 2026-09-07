import type { AgentCapability, AgentProvider } from '../model/agent';

export interface AgentCliRequest {
    command: string;
    prompt: string;
    provider?: AgentProvider;
    modelProvider?: string;
    capability?: AgentCapability;
    environment?: NodeJS.ProcessEnv;
    promptMode?: 'stdin' | 'argv';
    timeoutMs: number;
    signal?: AbortSignal;
    cwd?: string;
    maxOutputBytes?: number;
    maxPromptBytes?: number;
    /** Native final-response schema, used only by providers that support it. */
    outputSchema?: Record<string, unknown>;
}

export class AgentCliError extends Error {
    constructor(
        message: string,
        readonly category: 'configuration' | 'timeout' | 'cancelled' | 'process' | 'output',
        readonly retryable = false,
    ) {
        super(message);
        this.name = 'AgentCliError';
    }
}
