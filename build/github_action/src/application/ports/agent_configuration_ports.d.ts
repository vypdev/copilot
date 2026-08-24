export interface AgentConfiguration {
    provider: 'opencode' | 'codex' | 'cursor';
    modelProvider?: string;
    model: string;
    command?: string;
}
