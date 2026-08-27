import type { FixerQueryPort, FixerQueryRequest } from '../../../application/ports/agent_fixer_ports';
import { AgentCapabilityAdapter, type AgentCapabilityInfrastructure } from './agent_capability_adapter';
export declare class FixerAgentAdapter extends AgentCapabilityAdapter implements FixerQueryPort {
    constructor(infrastructure: AgentCapabilityInfrastructure);
    fix(request: FixerQueryRequest): Promise<{
        text: string;
        sessionId: string;
    } | undefined>;
}
