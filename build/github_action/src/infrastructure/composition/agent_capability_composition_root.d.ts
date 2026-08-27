import type { FindingsQueryPort } from '../../application/ports/agent_findings_ports';
import type { FixerQueryPort } from '../../application/ports/agent_fixer_ports';
import type { AgentCliPort } from '../agents/ports/agent_provider_ports';
export interface AgentCapabilityCompositionInfrastructure {
    readonly cli: AgentCliPort;
}
export declare function createFindingsQueryPort(infrastructure?: AgentCapabilityCompositionInfrastructure): FindingsQueryPort;
export declare function createFixerQueryPort(infrastructure?: AgentCapabilityCompositionInfrastructure): FixerQueryPort;
