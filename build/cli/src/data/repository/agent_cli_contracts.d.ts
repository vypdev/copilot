import type { AgentProvider } from '../model/agent';
export interface AgentCliRequest {
    command: string;
    prompt: string;
    provider?: AgentProvider;
    modelProvider?: string;
    environment?: NodeJS.ProcessEnv;
    promptMode?: 'stdin' | 'argv';
    timeoutMs: number;
    signal?: AbortSignal;
    cwd?: string;
    maxOutputBytes?: number;
}
export declare class AgentCliError extends Error {
    readonly category: 'configuration' | 'timeout' | 'cancelled' | 'process' | 'output';
    readonly retryable: boolean;
    constructor(message: string, category: 'configuration' | 'timeout' | 'cancelled' | 'process' | 'output', retryable?: boolean);
}
