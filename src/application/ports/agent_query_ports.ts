import type { AgentConfiguration } from './agent_configuration_ports';

/** Options shared by read-only, structured agent capabilities. */
export interface AgentQueryOptions {
    expectJson?: boolean;
    schema?: Record<string, unknown>;
    schemaName?: string;
    includeReasoning?: boolean;
}

export interface AgentQueryRequest {
    configuration: AgentConfiguration | undefined;
    prompt: string;
    options?: AgentQueryOptions;
}

export type AgentQueryResult = string | Record<string, unknown> | undefined;
