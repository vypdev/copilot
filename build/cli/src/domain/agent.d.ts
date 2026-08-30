export type AgentProvider = 'opencode' | 'codex' | 'cursor';
export type AgentTask = 'findings' | 'fixer';
export type AgentCapability = AgentTask | 'language';
export declare const DEFAULT_AGENT_PROVIDER: AgentProvider;
export declare const DEFAULT_MODEL_PROVIDER = "openai";
export declare const DEFAULT_AGENT_MODEL = "gpt-5.6-luna";
/**
 * Agent configuration is the provider-neutral contract shared by the action,
 * CLI and infrastructure adapters. Provider-specific command flags are
 * derived at the boundary instead of being assembled by callers.
 */
export interface AgentConfiguration {
    provider: AgentProvider;
    modelProvider?: string;
    model: string;
    effort?: string;
    command?: string;
}
export interface AgentTaskConfiguration {
    findings: AgentConfiguration;
    fixer: AgentConfiguration;
}
export declare function isAgentConfigurationReady(configuration: AgentConfiguration | undefined): boolean;
