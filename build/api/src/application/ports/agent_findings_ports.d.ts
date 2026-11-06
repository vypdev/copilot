import type { AgentQueryRequest, AgentQueryResult } from './agent_query_ports';
import type { AgentSourceSnapshot } from '../../domain/agent_source_snapshot';
export type { AgentQueryOptions } from './agent_query_ports';
export interface FindingsQueryRequest extends AgentQueryRequest {
    agentId: string;
    readonly signal?: AbortSignal;
    /** Host-selected immutable source for pre-branch SDD queries; never a cwd input. */
    readonly sourceSnapshot?: AgentSourceSnapshot;
}
export interface FindingsQueryPort {
    query(request: FindingsQueryRequest): Promise<AgentQueryResult>;
}
