import type { AgentConfiguration } from './agent_configuration_ports';
export interface AgentQueryOptions {
    expectJson?: boolean;
    schema?: Record<string, unknown>;
    schemaName?: string;
    includeReasoning?: boolean;
}
export interface FindingsQueryRequest {
    configuration: AgentConfiguration | undefined;
    agentId: string;
    prompt: string;
    options?: AgentQueryOptions;
}
export interface FindingsQueryPort {
    query(request: FindingsQueryRequest): Promise<string | Record<string, unknown> | undefined>;
}
