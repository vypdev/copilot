import type { AgentQueryRequest, AgentQueryResult } from './agent_query_ports';

export type { AgentQueryOptions } from './agent_query_ports';

export interface FindingsQueryRequest extends AgentQueryRequest {
    agentId: string;
}

export interface FindingsQueryPort {
    query(request: FindingsQueryRequest): Promise<AgentQueryResult>;
}
