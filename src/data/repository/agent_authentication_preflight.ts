import type { AgentConfiguration } from '../model/agent';
import { checkAgentAuthentication, type AgentAuthenticationCheck } from './agent_authentication';

export type AgentAuthenticationPreflightMode = 'required' | 'warn' | 'disabled';

export interface AgentAuthenticationPreflightResult {
    check: AgentAuthenticationCheck;
    mode: AgentAuthenticationPreflightMode;
    shouldFail: boolean;
}

export function resolveAgentAuthenticationPreflightMode(
    environment: NodeJS.ProcessEnv = process.env,
    defaultMode: AgentAuthenticationPreflightMode = 'required'
): AgentAuthenticationPreflightMode {
    const configured = environment.AGENT_AUTH_PREFLIGHT?.trim().toLowerCase();
    if (configured === 'required' || configured === 'warn' || configured === 'disabled') return configured;
    return defaultMode;
}

export function runAgentAuthenticationPreflight(
    configuration: AgentConfiguration,
    environment: NodeJS.ProcessEnv = process.env,
    defaultMode: AgentAuthenticationPreflightMode = 'required'
): AgentAuthenticationPreflightResult {
    const mode = resolveAgentAuthenticationPreflightMode(environment, defaultMode);
    const check = checkAgentAuthentication(configuration, environment);
    return { check, mode, shouldFail: mode === 'required' && check.status === 'missing' };
}
