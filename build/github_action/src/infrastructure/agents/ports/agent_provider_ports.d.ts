export interface AgentCliPort {
    execute(request: {
        command: string;
        prompt: string;
        promptMode?: 'stdin' | 'argv';
        timeoutMs: number;
        signal?: AbortSignal;
        cwd?: string;
        maxOutputBytes?: number;
    }): Promise<string>;
}
