import type { AgentConfiguration } from '../model/agent';
export type AgentCredentialStatus = 'available' | 'missing' | 'not_required';
export interface AgentAuthenticationCheck {
    status: AgentCredentialStatus;
    variables: readonly string[];
    message: string;
}
export declare function checkAgentAuthentication(configuration: AgentConfiguration, environment?: NodeJS.ProcessEnv): AgentAuthenticationCheck;
