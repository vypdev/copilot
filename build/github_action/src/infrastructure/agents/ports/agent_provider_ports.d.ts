import type { AgentCapability, AgentProvider } from '../../../domain/agent';
export interface AgentCliPort {
    execute(request: {
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
    }): Promise<string>;
}
