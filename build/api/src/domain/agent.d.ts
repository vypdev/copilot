export type AgentProvider = 'opencode' | 'codex' | 'cursor';
export type AgentTask = 'findings' | 'fixer' | 'planner' | 'reviewer' | 'tester';
export type AgentCapability = AgentTask | 'language';
export declare const DEFAULT_AGENT_PROVIDER: AgentProvider;
export declare const DEFAULT_MODEL_PROVIDER = "openai";
export declare const DEFAULT_AGENT_MODEL = "gpt-5.6-luna";
export declare const AGENT_EXECUTABLE_BASENAMES: Readonly<Record<AgentProvider, string>>;
/**
 * Agent configuration is the provider-neutral contract shared by entrypoints
 * and the execution planner. Provider argv and authority are never supplied by
 * callers; each provider policy reconstructs them from these structured facts.
 */
export interface AgentConfiguration {
    provider: AgentProvider;
    modelProvider?: string;
    model: string;
    effort?: string;
    executable?: string;
}
export interface AgentTaskConfiguration {
    findings: AgentConfiguration;
    fixer: AgentConfiguration;
    planner?: AgentConfiguration;
    reviewer?: AgentConfiguration;
    tester?: AgentConfiguration;
}
export declare function isAgentConfigurationReady(configuration: AgentConfiguration | undefined): boolean;
