export interface AgentCliPort {
    execute(request: {
        command: string;
        prompt: string;
        timeoutMs: number;
        signal?: AbortSignal;
        cwd?: string;
        maxOutputBytes?: number;
    }): Promise<string>;
}