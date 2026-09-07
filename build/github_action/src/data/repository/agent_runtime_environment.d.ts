import type { AgentCapability, AgentProvider } from '../model/agent';
export interface PreparedAgentRuntimeEnvironment {
    environment: NodeJS.ProcessEnv;
    cleanup(): void;
}
/** Builds a per-invocation provider boundary without mutating runner configuration. */
export declare function prepareAgentRuntimeEnvironment(provider: AgentProvider | undefined, capability: AgentCapability | undefined, source?: NodeJS.ProcessEnv, modelProvider?: string): PreparedAgentRuntimeEnvironment;
