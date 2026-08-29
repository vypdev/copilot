import type { FindingsQueryPort, FindingsQueryRequest } from '../../../application/ports/agent_findings_ports';
import { AgentCapabilityAdapter } from './agent_capability_adapter';
export declare class FindingsAgentAdapter extends AgentCapabilityAdapter implements FindingsQueryPort {
    query(request: FindingsQueryRequest): Promise<string | Record<string, unknown> | undefined>;
}
