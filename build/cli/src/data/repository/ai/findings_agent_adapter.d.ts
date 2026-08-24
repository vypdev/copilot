import type { FindingsQueryPort, FindingsQueryRequest } from '../../../application/ports/agent_findings_ports';
import { AgentCapabilityAdapter, type AgentCapabilityInfrastructure } from './agent_capability_adapter';
export declare class FindingsAgentAdapter extends AgentCapabilityAdapter implements FindingsQueryPort {
    constructor(infrastructure: AgentCapabilityInfrastructure);
    query(request: FindingsQueryRequest): Promise<string | Record<string, unknown> | undefined>;
}
