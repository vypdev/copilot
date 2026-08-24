export type AgentProvider = 'opencode' | 'codex' | 'cursor';
export type AgentTask = 'findings' | 'fixer';
export interface AgentConfiguration {
    provider: AgentProvider;
    modelProvider?: string;
    model: string;
    command?: string;
}
export interface AgentTaskConfiguration {
    findings: AgentConfiguration;
    fixer: AgentConfiguration;
}
export declare function isAgentConfigurationReady(configuration: AgentConfiguration | undefined): boolean;
