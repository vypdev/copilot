import type { AgentConfiguration, AgentProvider } from '../model/agent';
export type AgentCredentialStatus = 'available' | 'missing' | 'not_required';
export interface AgentAuthenticationCheck {
    status: AgentCredentialStatus;
    variables: readonly string[];
    message: string;
}
export interface AgentAuthenticationSystem {
    hasOperationalCodexLogin(executable: string, environment: NodeJS.ProcessEnv): boolean;
}
/** Keeps only explicitly allowed runtime values and credentials for the selected process. */
export declare function buildAgentCliEnvironment(provider: AgentProvider | undefined, environment?: NodeJS.ProcessEnv, modelProvider?: string): NodeJS.ProcessEnv;
export declare function checkAgentAuthentication(configuration: AgentConfiguration, environment?: NodeJS.ProcessEnv, system?: AgentAuthenticationSystem): AgentAuthenticationCheck;
