import type { AgentConfiguration } from '../model/agent';
import { type AgentAuthenticationCheck } from './agent_authentication';
export type AgentAuthenticationPreflightMode = 'required' | 'warn' | 'disabled';
export interface AgentAuthenticationPreflightResult {
    check: AgentAuthenticationCheck;
    mode: AgentAuthenticationPreflightMode;
    shouldFail: boolean;
}
export declare function resolveAgentAuthenticationPreflightMode(environment?: NodeJS.ProcessEnv, defaultMode?: AgentAuthenticationPreflightMode): AgentAuthenticationPreflightMode;
export declare function runAgentAuthenticationPreflight(configuration: AgentConfiguration, environment?: NodeJS.ProcessEnv, defaultMode?: AgentAuthenticationPreflightMode): AgentAuthenticationPreflightResult;
