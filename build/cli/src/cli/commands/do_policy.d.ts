import type { AgentConfiguration, AgentTaskConfiguration } from '../../domain/agent';
export { buildDoAgentTasks } from './do_agent_task_policy';
export type { DoAgentOptions } from './do_command_contracts';
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
export declare function resolveDoPrompt(value: unknown): string | undefined;
export declare function resolveDoOutputFormat(value: unknown): DoOutputFormat | undefined;
/** Converts authentication preflight outcomes into CLI-neutral notices. */
export declare function collectDoAuthenticationNotices(agentTasks: AgentTaskConfiguration, runPreflight: DoAuthenticationPreflight): readonly DoAuthenticationNotice[];
export declare function formatDoJsonResponse(text: string | undefined, sessionId?: string): string;
export declare function formatDoTextResponse(text: string | undefined): string;
export declare function formatDoResponse(text: string | undefined, sessionId: string | undefined, outputFormat: DoOutputFormat): string;
