import type { AgentConfiguration, AgentProvider } from '../model/agent';
export type AgentCredentialStatus = 'available' | 'missing' | 'not_required';
export interface AgentAuthenticationCheck {
    status: AgentCredentialStatus;
    variables: readonly string[];
    message: string;
}
/**
 * Keeps provider credentials inside the process boundary that needs them.
 *
 * A controlled Codex runner authenticates through CODEX_HOME/auth.json. When
 * that session is available, exported API credentials must not be allowed to
 * change the authentication mode selected by the local CLI. If the session is
 * absent, the existing API-key/access-token fallback remains available.
 */
export declare function buildAgentCliEnvironment(provider: AgentProvider | undefined, environment?: NodeJS.ProcessEnv): NodeJS.ProcessEnv;
export declare function checkAgentAuthentication(configuration: AgentConfiguration, environment?: NodeJS.ProcessEnv): AgentAuthenticationCheck;
