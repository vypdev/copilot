import type { AgentConfiguration, AgentTaskConfiguration } from '../../domain/agent';
export type DoOutputFormat = 'text' | 'json';
export type DoAuthenticationTask = 'findings' | 'fixer';
export interface DoAuthenticationPreflightResult {
    check: {
        status: 'available' | 'missing' | 'not_required';
        message: string;
    };
    mode: 'required' | 'warn' | 'disabled';
    shouldFail: boolean;
}
export type DoAuthenticationPreflight = (configuration: AgentConfiguration) => DoAuthenticationPreflightResult;
export interface DoAuthenticationNotice {
    task: DoAuthenticationTask;
    severity: 'error' | 'warning';
    message: string;
}
export interface DoAgentOptions {
    agentProvider?: string;
    agentModelProvider?: string;
    agentModel?: string;
    agentEffort?: string;
    agentCommand?: string;
    findingsProvider?: string;
    findingsModelProvider?: string;
    findingsEffort?: string;
    findingsModel?: string;
    findingsCommand?: string;
    fixerProvider?: string;
    fixerModelProvider?: string;
    fixerEffort?: string;
    fixerModel?: string;
    fixerCommand?: string;
}
export declare function buildDoAgentTasks(options: DoAgentOptions): AgentTaskConfiguration;
export declare function resolveDoPrompt(value: unknown): string | undefined;
export declare function resolveDoOutputFormat(value: unknown): DoOutputFormat | undefined;
/** Converts authentication preflight outcomes into CLI-neutral notices. */
export declare function collectDoAuthenticationNotices(agentTasks: AgentTaskConfiguration, runPreflight: DoAuthenticationPreflight): readonly DoAuthenticationNotice[];
export declare function formatDoJsonResponse(text: string | undefined, sessionId?: string): string;
export declare function formatDoTextResponse(text: string | undefined): string;
export declare function formatDoResponse(text: string | undefined, sessionId: string | undefined, outputFormat: DoOutputFormat): string;
