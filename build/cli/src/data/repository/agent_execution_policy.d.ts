import type { AgentCapability, AgentProvider } from '../model/agent';
/**
 * Applies a capability boundary after parsing the command and immediately
 * before spawn, so custom commands cannot bypass the runtime policy.
 */
export declare function enforceAgentExecutionPolicy(provider: AgentProvider | undefined, capability: AgentCapability | undefined, args: readonly string[]): string[];
