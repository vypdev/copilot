import type { AgentProvider } from '../model/agent';
export interface PreparedAgentOutputSchema {
    path?: string;
    cleanup(): void;
}
/** Writes a short-lived, owner-readable schema only for Codex native structured outputs. */
export declare function prepareAgentOutputSchema(provider: AgentProvider | undefined, schema: Record<string, unknown> | undefined): PreparedAgentOutputSchema;
