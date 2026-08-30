import type { AgentQueryRequest, AgentQueryResult } from './agent_query_ports';

export interface LanguageQueryRequest extends AgentQueryRequest {
    agentId: string;
}

/** Read-only language capability used by comment translation workflows. */
export interface LanguageQueryPort {
    query(request: LanguageQueryRequest): Promise<AgentQueryResult>;
}
