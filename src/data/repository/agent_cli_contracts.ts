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
